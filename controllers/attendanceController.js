const asyncHandler = require("express-async-handler");
const Attendance = require("../models/Attendance");
const User = require("../models/User");

const STAFF_ROLES = ["admin", "manager", "cashier", "warehouse", "courier"];

const startOfDay = (input) => {
  const d = input ? new Date(input) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// @desc    Berilgan kun uchun barcha xodimlar va ularning davomat holati
// @route   GET /api/attendance?date=YYYY-MM-DD
// @access  Private/Admin,Manager
const getDailyAttendance = asyncHandler(async (req, res) => {
  const date = startOfDay(req.query.date);
  const nextDay = new Date(date);
  nextDay.setDate(date.getDate() + 1);

  const staff = await User.find({ role: { $in: STAFF_ROLES }, isBlocked: false }).select(
    "name email role monthlySalary"
  );

  const records = await Attendance.find({ date: { $gte: date, $lt: nextDay } });
  const byUser = Object.fromEntries(records.map((r) => [r.user.toString(), r]));

  const data = staff.map((u) => ({
    user: u,
    status: byUser[u._id.toString()]?.status || null,
  }));

  res.json({ success: true, date: date.toISOString().slice(0, 10), data });
});

// @desc    Xodim uchun davomat belgilash (keldi/kelmadi) — bor bo'lsa yangilanadi
// @route   POST /api/attendance
// @access  Private/Admin,Manager
const markAttendance = asyncHandler(async (req, res) => {
  const { userId, date, status, note } = req.body;

  if (!userId || !status) {
    res.status(400);
    throw new Error("Xodim va status kiritilishi shart");
  }
  if (!["keldi", "kelmadi", "sababli"].includes(status)) {
    res.status(400);
    throw new Error("Noto'g'ri status qiymati");
  }

  const day = startOfDay(date);

  const record = await Attendance.findOneAndUpdate(
    { user: userId, date: day },
    { user: userId, date: day, status, note: note || "", markedBy: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({ success: true, data: record });
});

// @desc    Bir oylik davomat asosida maosh hisob-kitobi (kelmagan kunlar uchun ushlab qolish)
// @route   GET /api/attendance/summary?month=YYYY-MM
// @access  Private/Admin
const getMonthlySummary = asyncHandler(async (req, res) => {
  const now = new Date();
  const [year, month] = (req.query.month || `${now.getFullYear()}-${now.getMonth() + 1}`)
    .split("-")
    .map(Number);

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1); // keyingi oyning 1-kuni (exclusive)
  const today = startOfDay();
  const rangeEnd = monthEnd < today ? monthEnd : new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const staff = await User.find({ role: { $in: STAFF_ROLES }, isBlocked: false }).select(
    "name email role monthlySalary"
  );

  const records = await Attendance.find({
    date: { $gte: monthStart, $lt: rangeEnd },
  });

  const summaryByUser = {};
  for (const r of records) {
    const key = r.user.toString();
    if (!summaryByUser[key]) summaryByUser[key] = { keldi: 0, kelmadi: 0, sababli: 0 };
    summaryByUser[key][r.status] += 1;
  }

  const data = staff.map((u) => {
    const s = summaryByUser[u._id.toString()] || { keldi: 0, kelmadi: 0, sababli: 0 };
    const dailyRate = (u.monthlySalary || 0) / 30;
    // Faqat "sababsiz" kelmagan kunlar uchun ushlab qolinadi; "sababli" hisobga olinmaydi.
    const deduction = Math.round(dailyRate * s.kelmadi);
    const netSalary = Math.max((u.monthlySalary || 0) - deduction, 0);

    return {
      user: { _id: u._id, name: u.name, email: u.email, role: u.role, monthlySalary: u.monthlySalary },
      keldi: s.keldi,
      kelmadi: s.kelmadi,
      sababli: s.sababli,
      dailyRate: Math.round(dailyRate),
      deduction,
      netSalary,
    };
  });

  res.json({
    success: true,
    month: `${year}-${String(month).padStart(2, "0")}`,
    data,
  });
});

module.exports = { getDailyAttendance, markAttendance, getMonthlySummary };

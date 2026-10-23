const asyncHandler = require("express-async-handler");
const User = require("../models/User");

// @desc    Barcha foydalanuvchilar (filtr: ?role=customer)
// @route   GET /api/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  const { role } = req.query;
  let query = {};
  if (role) {
    const roles = role.split(",").map((r) => r.trim()).filter(Boolean);
    query = roles.length > 1 ? { role: { $in: roles } } : { role: roles[0] };
  }
  const users = await User.find(query).sort({ createdAt: -1 });
  res.json({ success: true, count: users.length, data: users });
});

// @desc    Bitta foydalanuvchi
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("Foydalanuvchi topilmadi");
  }
  res.json({ success: true, data: user });
});

// @desc    Xodimga rol/huquq berish (Kassir, Omborchi, Menejer, Kuryer)
// @route   PATCH /api/users/:id/role
// @access  Private/Admin
const updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const validRoles = ["customer", "admin", "manager", "cashier", "warehouse", "courier"];
  if (!validRoles.includes(role)) {
    res.status(400);
    throw new Error("Noto'g'ri rol qiymati");
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("Foydalanuvchi topilmadi");
  }
  user.role = role;
  await user.save();
  res.json({ success: true, data: user });
});

// @desc    Foydalanuvchini bloklash / blokdan chiqarish
// @route   PATCH /api/users/:id/block
// @access  Private/Admin
const toggleBlockUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("Foydalanuvchi topilmadi");
  }
  user.isBlocked = !user.isBlocked;
  await user.save();
  res.json({ success: true, data: user });
});

// @desc    Admin tomonidan yangi xodim hisobini yaratish (Kassir, Omborchi, Menejer, Kuryer, Admin)
// @route   POST /api/users
// @access  Private/Admin
const createStaffUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role, monthlySalary } = req.body;
  const validRoles = ["customer", "admin", "manager", "cashier", "warehouse", "courier"];

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Ism, email va parol kiritilishi shart");
  }

  if (role && !validRoles.includes(role)) {
    res.status(400);
    throw new Error("Noto'g'ri rol qiymati");
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("Bu email bilan foydalanuvchi allaqachon mavjud");
  }

  const user = await User.create({
    name,
    email,
    password,
    phone,
    role: role || "cashier",
    monthlySalary: monthlySalary || 0,
  });

  res.status(201).json({ success: true, data: user });
});

// @desc    Xodimning oylik maoshini belgilash/yangilash
// @route   PATCH /api/users/:id/salary
// @access  Private/Admin
const updateSalary = asyncHandler(async (req, res) => {
  const { monthlySalary } = req.body;
  if (monthlySalary === undefined || monthlySalary < 0) {
    res.status(400);
    throw new Error("To'g'ri oylik summasi kiritilishi shart");
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("Foydalanuvchi topilmadi");
  }
  user.monthlySalary = monthlySalary;
  await user.save();
  res.json({ success: true, data: user });
});

module.exports = { getUsers, getUserById, createStaffUser, updateUserRole, updateSalary, toggleBlockUser };

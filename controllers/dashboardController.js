const asyncHandler = require("express-async-handler");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");

// @desc    Direktor uchun umumiy dashboard statistikasi
// @route   GET /api/dashboard/summary
// @access  Private/Admin
const getSummary = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const paidFilter = { isPaid: true, status: { $ne: "bekor_qilindi" } };

  const [todayRevenue, monthRevenue, totalCustomers, lowStockCount, ordersToday] =
    await Promise.all([
      Order.aggregate([
        { $match: { ...paidFilter, createdAt: { $gte: startOfDay } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Order.aggregate([
        { $match: { ...paidFilter, createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      User.countDocuments({ role: "customer" }),
      Product.countDocuments({ $expr: { $lte: ["$stock", "$lowStockThreshold"] } }),
      Order.countDocuments({ createdAt: { $gte: startOfDay } }),
    ]);

  res.json({
    success: true,
    data: {
      todayRevenue: todayRevenue[0]?.total || 0,
      monthRevenue: monthRevenue[0]?.total || 0,
      totalCustomers,
      lowStockCount,
      ordersToday,
    },
  });
});

// @desc    Eng ko'p sotilgan TOP-10 mahsulotlar
// @route   GET /api/dashboard/top-products
// @access  Private/Admin
const getTopProducts = asyncHandler(async (req, res) => {
  const products = await Product.find().sort({ soldCount: -1 }).limit(10);
  res.json({ success: true, data: products });
});

// @desc    Umuman sotilmayotgan (muzlab qolgan) mahsulotlar
// @route   GET /api/dashboard/dead-stock
// @access  Private/Admin
const getDeadStock = asyncHandler(async (req, res) => {
  const products = await Product.find({ soldCount: 0 }).sort({ createdAt: 1 });
  res.json({ success: true, count: products.length, data: products });
});

// @desc    Oxirgi 14 kunlik savdo dinamikasi (kunlar bo'yicha tushum)
// @route   GET /api/dashboard/sales-series
// @access  Private/Admin
const getSalesSeries = asyncHandler(async (req, res) => {
  const paidFilter = { isPaid: true, status: { $ne: "bekor_qilindi" } };

  let from, days;

  if (req.query.month) {
    // Aniq oy tanlangan: 2026-09 kabi. Shu oyning 1-kunidan bugungi
    // kungacha (yoki oy tugagan bo'lsa oxirgi kunigacha) ko'rsatiladi.
    const [year, month] = req.query.month.split("-").map(Number);
    from = new Date(year, month - 1, 1);
    from.setHours(0, 0, 0, 0);
    const monthEnd = new Date(year, month, 0); // shu oyning oxirgi kuni
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastDay = monthEnd < today ? monthEnd : today;
    days = Math.floor((lastDay - from) / (1000 * 60 * 60 * 24)) + 1;
  } else {
    days = Number(req.query.days) || 14;
    from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));
  }

  const rows = await Order.aggregate([
    { $match: { ...paidFilter, createdAt: { $gte: from } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        total: { $sum: "$totalAmount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byDate = Object.fromEntries(rows.map((r) => [r._id, r]));
  const series = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    series.push({
      date: key,
      total: byDate[key]?.total || 0,
      count: byDate[key]?.count || 0,
    });
  }

  res.json({ success: true, data: series });
});

// @desc    Kategoriyalar bo'yicha savdo taqsimoti (donadan)
// @route   GET /api/dashboard/category-breakdown
// @access  Private/Admin
const getCategoryBreakdown = asyncHandler(async (req, res) => {
  const paidFilter = { isPaid: true, status: { $ne: "bekor_qilindi" } };

  const rows = await Order.aggregate([
    { $match: paidFilter },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "products",
        localField: "items.product",
        foreignField: "_id",
        as: "productDoc",
      },
    },
    { $unwind: { path: "$productDoc", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$productDoc.category",
        qty: { $sum: "$items.quantity" },
        revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "_id",
        as: "categoryDoc",
      },
    },
    { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        category: { $ifNull: ["$categoryDoc.name", "Boshqa"] },
        qty: 1,
        revenue: 1,
      },
    },
    { $sort: { revenue: -1 } },
  ]);

  res.json({ success: true, data: rows });
});

module.exports = { getSummary, getTopProducts, getDeadStock, getSalesSeries, getCategoryBreakdown };

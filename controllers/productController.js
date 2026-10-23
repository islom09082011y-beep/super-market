const asyncHandler = require("express-async-handler");
const Product = require("../models/Product");

// @desc    Mahsulotlarni olish (qidiruv, filtr, sahifalash bilan)
//          /api/products?search=telefon&category=ID&page=1&limit=20
// @route   GET /api/products
// @access  Public
const getProducts = asyncHandler(async (req, res) => {
  const { search, category, minPrice, maxPrice, page = 1, limit = 20 } = req.query;

  const query = { isActive: true };

  if (search) {
    query.$text = { $search: search };
  }
  if (category) {
    query.category = category;
  }
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [products, total] = await Promise.all([
    Product.find(query)
      .populate("category", "name")
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 }),
    Product.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: products.length,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    data: products,
  });
});

// @desc    Bitta mahsulotni olish
// @route   GET /api/products/:id
// @access  Public
const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate("category", "name");
  if (!product) {
    res.status(404);
    throw new Error("Mahsulot topilmadi");
  }
  res.json({ success: true, data: product });
});

// @desc    Shtrix-kod bo'yicha mahsulotni topish (kassa uchun)
// @route   GET /api/products/barcode/:code
// @access  Private (Cashier/Admin)
const getProductByBarcode = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ barcode: req.params.code });
  if (!product) {
    res.status(404);
    throw new Error("Ushbu shtrix-kodga mos mahsulot topilmadi");
  }
  res.json({ success: true, data: product });
});

// @desc    Kam qolgan mahsulotlar ro'yxati
// @route   GET /api/products/low-stock
// @access  Private (Admin/Warehouse)
const getLowStockProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({
    $expr: { $lte: ["$stock", "$lowStockThreshold"] },
  });
  res.json({ success: true, count: products.length, data: products });
});

// @desc    Muddati o'tayotgan/o'tgan mahsulotlar ro'yxati
// @route   GET /api/products/expiring?days=7
// @access  Private (Admin/Warehouse)
const getExpiringProducts = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 7;
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + days);

  const products = await Product.find({
    expiryDate: { $ne: null, $lte: limitDate },
  }).sort({ expiryDate: 1 });

  res.json({ success: true, count: products.length, data: products });
});

// @desc    Mahsulot yaratish
// @route   POST /api/products
// @access  Private/Admin
const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json({ success: true, data: product });
});

// @desc    Mahsulotni yangilash
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Mahsulot topilmadi");
  }
  Object.assign(product, req.body);
  const updated = await product.save();
  res.json({ success: true, data: updated });
});

// @desc    Mahsulot qoldig'ini kirim/chiqim qilish
// @route   PATCH /api/products/:id/stock
// @access  Private/Admin/Warehouse
const adjustStock = asyncHandler(async (req, res) => {
  const { quantity, type } = req.body; // type: "kirim" | "chiqim"
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Mahsulot topilmadi");
  }

  if (type === "kirim") {
    product.stock += Number(quantity);
  } else if (type === "chiqim") {
    if (product.stock < quantity) {
      res.status(400);
      throw new Error("Omborda yetarli mahsulot yo'q");
    }
    product.stock -= Number(quantity);
  } else {
    res.status(400);
    throw new Error("type maydoni 'kirim' yoki 'chiqim' bo'lishi kerak");
  }

  await product.save();
  res.json({ success: true, data: product });
});

// @desc    Mahsulotni o'chirish
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Mahsulot topilmadi");
  }
  await product.deleteOne();
  res.json({ success: true, message: "Mahsulot o'chirildi" });
});

module.exports = {
  getProducts,
  getProductById,
  getProductByBarcode,
  getLowStockProducts,
  getExpiringProducts,
  createProduct,
  updateProduct,
  adjustStock,
  deleteProduct,
};

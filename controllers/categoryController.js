const asyncHandler = require("express-async-handler");
const Category = require("../models/Category");

// @desc    Barcha kategoriyalarni olish
// @route   GET /api/categories
// @access  Public
const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find().populate("parent", "name");
  res.json({ success: true, count: categories.length, data: categories });
});

// @desc    Bitta kategoriyani olish
// @route   GET /api/categories/:id
// @access  Public
const getCategoryById = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error("Kategoriya topilmadi");
  }
  res.json({ success: true, data: category });
});

// @desc    Kategoriya yaratish
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = asyncHandler(async (req, res) => {
  const { name, image, parent } = req.body;
  const category = await Category.create({ name, image, parent: parent || null });
  res.status(201).json({ success: true, data: category });
});

// @desc    Kategoriyani yangilash
// @route   PUT /api/categories/:id
// @access  Private/Admin
const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error("Kategoriya topilmadi");
  }

  Object.assign(category, req.body);
  const updated = await category.save();
  res.json({ success: true, data: updated });
});

// @desc    Kategoriyani o'chirish
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error("Kategoriya topilmadi");
  }
  await category.deleteOne();
  res.json({ success: true, message: "Kategoriya o'chirildi" });
});

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};

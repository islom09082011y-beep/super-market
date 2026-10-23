const asyncHandler = require("express-async-handler");
const Announcement = require("../models/Announcement");

// @desc    Hozirgi faol reklamani olish (xaridorlar uchun, ochiq)
// @route   GET /api/announcements/active
// @access  Public
const getActiveAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findOne({ isActive: true }).sort({ createdAt: -1 });
  res.json({ success: true, data: announcement || null });
});

// @desc    Barcha reklamalar ro'yxati (admin uchun)
// @route   GET /api/announcements
// @access  Private/Admin
const getAnnouncements = asyncHandler(async (req, res) => {
  const list = await Announcement.find().sort({ createdAt: -1 });
  res.json({ success: true, data: list });
});

// @desc    Yangi reklama yaratish
// @route   POST /api/announcements
// @access  Private/Admin
const createAnnouncement = asyncHandler(async (req, res) => {
  const { text, linkUrl, linkLabel, isActive } = req.body;
  if (!text) {
    res.status(400);
    throw new Error("Reklama matni kiritilishi shart");
  }

  // Faqat bitta reklama faol bo'lishi uchun, yangisi faol qilib
  // yaratilsa, qolganlarini o'chirib qo'yamiz.
  if (isActive !== false) {
    await Announcement.updateMany({}, { isActive: false });
  }

  const announcement = await Announcement.create({
    text,
    linkUrl: linkUrl || "",
    linkLabel: linkLabel || "Ko'rish",
    isActive: isActive !== false,
  });

  res.status(201).json({ success: true, data: announcement });
});

// @desc    Reklamani tahrirlash (matn, havola, faollik)
// @route   PATCH /api/announcements/:id
// @access  Private/Admin
const updateAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) {
    res.status(404);
    throw new Error("Reklama topilmadi");
  }

  const { text, linkUrl, linkLabel, isActive } = req.body;

  if (isActive === true) {
    await Announcement.updateMany({ _id: { $ne: announcement._id } }, { isActive: false });
  }

  if (text !== undefined) announcement.text = text;
  if (linkUrl !== undefined) announcement.linkUrl = linkUrl;
  if (linkLabel !== undefined) announcement.linkLabel = linkLabel;
  if (isActive !== undefined) announcement.isActive = isActive;

  await announcement.save();
  res.json({ success: true, data: announcement });
});

// @desc    Reklamani o'chirish
// @route   DELETE /api/announcements/:id
// @access  Private/Admin
const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) {
    res.status(404);
    throw new Error("Reklama topilmadi");
  }
  await announcement.deleteOne();
  res.json({ success: true, data: {} });
});

module.exports = {
  getActiveAnnouncement,
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};

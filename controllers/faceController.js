const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const { THRESHOLD, isValidDescriptor, distance, average } = require("../utils/face");

const fail = (res, status, message) => {
  res.status(status);
  throw new Error(message);
};

// Parolli hisoblarda amalni parol bilan tasdiqlash talab qilinadi
const confirmPassword = async (res, userId, password) => {
  const user = await User.findById(userId).select("+faceDescriptor");
  if (user.password && !(password && (await user.matchPassword(password)))) {
    fail(res, 400, "Parol noto'g'ri");
  }
  return user;
};

// @route GET /api/face/status
const faceStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+faceDescriptor faceEnrolledAt faceRequiredForOrders");
  const enrolled = Array.isArray(user.faceDescriptor) && user.faceDescriptor.length === 128;
  res.json({
    success: true,
    data: { enrolled, enrolledAt: user.faceEnrolledAt, requiredForOrders: Boolean(user.faceRequiredForOrders && enrolled) },
  });
});

// @desc    Yuzni ro'yxatdan o'tkazish: 3-5 ta namuna (128 o'lchamli vektor), parol bilan tasdiqlanadi
// @route   POST /api/face/enroll   body: { descriptors: [[128], [128], [128]], password }
const enrollFace = asyncHandler(async (req, res) => {
  const { descriptors, password } = req.body;
  if (!Array.isArray(descriptors) || descriptors.length < 3 || descriptors.length > 5) {
    fail(res, 400, "Yuzni ro'yxatdan o'tkazish uchun 3 dan 5 gacha namuna kerak");
  }
  if (!descriptors.every(isValidDescriptor)) fail(res, 400, "Yuz ma'lumoti noto'g'ri");

  // Namunalar bir kishiga tegishli ekanini tekshiramiz
  for (let i = 0; i < descriptors.length; i++) {
    for (let j = i + 1; j < descriptors.length; j++) {
      if (distance(descriptors[i], descriptors[j]) > THRESHOLD + 0.1) {
        fail(res, 400, "Namunalar bir-biriga mos kelmadi. Yuzingiz kameraga to'g'ri qaragan holda qayta urinib ko'ring");
      }
    }
  }
  const user = await confirmPassword(res, req.user._id, password);
  user.faceDescriptor = average(descriptors);
  user.faceEnrolledAt = new Date();
  await user.save({ validateModifiedOnly: true });
  res.json({ success: true, data: { enrolled: true, enrolledAt: user.faceEnrolledAt } });
});

// @route DELETE /api/face   body: { password }
const removeFace = asyncHandler(async (req, res) => {
  const user = await confirmPassword(res, req.user._id, req.body && req.body.password);
  user.faceDescriptor = undefined;
  user.faceEnrolledAt = null;
  user.faceRequiredForOrders = false;
  await user.save({ validateModifiedOnly: true });
  res.json({ success: true, data: { enrolled: false } });
});

// @desc    "Har bir buyurtma yuz orqali tasdiqlansin" rejimini yoqish/o'chirish
// @route   PATCH /api/face/required   body: { required: boolean, password }
const setFaceRequired = asyncHandler(async (req, res) => {
  const user = await confirmPassword(res, req.user._id, req.body.password);
  const required = req.body.required === true;
  if (required && !(Array.isArray(user.faceDescriptor) && user.faceDescriptor.length === 128)) {
    fail(res, 400, "Avval yuzingizni ro'yxatdan o'tkazing");
  }
  user.faceRequiredForOrders = required;
  await user.save({ validateModifiedOnly: true });
  res.json({ success: true, data: { requiredForOrders: required } });
});

module.exports = { faceStatus, enrollFace, removeFace, setFaceRequired };

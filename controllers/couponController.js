const asyncHandler = require("express-async-handler");
const Coupon = require("../models/Coupon");

// @desc    Barcha promo-kodlar
// @route   GET /api/coupons
// @access  Private/Admin
const getCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  res.json({ success: true, count: coupons.length, data: coupons });
});

// @desc    Promo-kod yaratish
// @route   POST /api/coupons
// @access  Private/Admin
const createCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.create(req.body);
  res.status(201).json({ success: true, data: coupon });
});

// @desc    Promo-kodni yangilash
// @route   PUT /api/coupons/:id
// @access  Private/Admin
const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) {
    res.status(404);
    throw new Error("Promo-kod topilmadi");
  }
  Object.assign(coupon, req.body);
  const updated = await coupon.save();
  res.json({ success: true, data: updated });
});

// @desc    Promo-kodni o'chirish
// @route   DELETE /api/coupons/:id
// @access  Private/Admin
const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) {
    res.status(404);
    throw new Error("Promo-kod topilmadi");
  }
  await coupon.deleteOne();
  res.json({ success: true, message: "Promo-kod o'chirildi" });
});

// @desc    Promo-kodni tekshirish (checkout paytida narxni qayta hisoblash uchun)
// @route   POST /api/coupons/apply
// @access  Private
const applyCoupon = asyncHandler(async (req, res) => {
  const { code, orderAmount } = req.body;

  const coupon = await Coupon.findOne({ code: code?.toUpperCase() });
  if (!coupon) {
    res.status(404);
    throw new Error("Promo-kod topilmadi");
  }

  if (!coupon.isValid(orderAmount)) {
    res.status(400);
    throw new Error("Promo-kod yaroqsiz yoki shartlarga mos kelmaydi");
  }

  let discountAmount = 0;
  if (coupon.discountType === "percent") {
    discountAmount = (orderAmount * coupon.discountValue) / 100;
  } else {
    discountAmount = coupon.discountValue;
  }
  discountAmount = Math.min(discountAmount, orderAmount);

  res.json({
    success: true,
    data: {
      code: coupon.code,
      discountAmount,
      newTotal: orderAmount - discountAmount,
    },
  });
});

module.exports = { getCoupons, createCoupon, updateCoupon, deleteCoupon, applyCoupon };

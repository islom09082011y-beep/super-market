const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Promo-kod kiritilishi shart"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    discountType: {
      type: String,
      enum: ["percent", "amount"], // foizda yoki summada
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    minOrderAmount: {
      type: Number,
      default: 0,
    },
    maxUsage: {
      type: Number,
      default: null, // null = cheksiz
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

couponSchema.methods.isValid = function (orderAmount) {
  if (!this.isActive) return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  if (this.maxUsage !== null && this.usedCount >= this.maxUsage) return false;
  if (orderAmount < this.minOrderAmount) return false;
  return true;
};

module.exports = mongoose.model("Coupon", couponSchema);

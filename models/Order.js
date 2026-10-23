const mongoose = require("mongoose");

// Order_Items - har bir buyurtmadagi mahsulotlar
const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: { type: String, required: true }, // sotuv paytidagi nomi (tarix uchun)
    price: { type: Number, required: true }, // sotuv paytidagi narxi
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, sparse: true }, // SE-000123
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: (v) => Array.isArray(v) && v.length > 0,
    },
    subtotal: {
      type: Number,
      required: true,
    },
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    deliveryFee: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    note: { type: String, default: "", maxlength: 300 }, // xaridorning izohi
    deliverySlot: {
      date: { type: String, default: "" }, // YYYY-MM-DD
      slot: { type: String, default: "" }, // 09:00-12:00 ...
    },
    statusHistory: { type: [historySchema], default: [] },
<<<<<<< HEAD
    cancelledBy: { type: String, enum: ["", "customer", "staff", "system"], default: "" },
    staffNote: { type: String, default: "", maxlength: 500 }, // faqat xodimlar ko'radi
    isUrgent: { type: Boolean, default: false },
    faceVerified: { type: Boolean, default: false },
    paymentProvider: { type: String, enum: ["", "click", "payme", "sandbox", "manual"], default: "" },
    paidAt: { type: Date, default: null },
    paymentExpiresAt: { type: Date, default: null }, // onlayn to'lov kutish muddati
=======
    cancelledBy: { type: String, enum: ["", "customer", "staff"], default: "" },
>>>>>>> bc9ae5889c64d5cf0633056236dfd6089059bec4
    paymentMethod: {
      type: String,
      enum: ["naqd", "karta", "click", "payme", "nasiya"],
      default: "naqd",
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: [
        "yangi",
        "tasdiqlandi",
        "yigilmoqda",
        "yetkazilmoqda",
        "yetkazildi",
        "bekor_qilindi",
      ],
      default: "yangi",
    },
    deliveryAddress: {
      region: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    courier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancelReason: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);

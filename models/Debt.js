const mongoose = require("mongoose");

// Mijozlar qarz daftari (nasiya). Mijoz ro'yxatdan o'tgan bo'lishi shart emas.
const paymentSchema = new mongoose.Schema(
  { amount: { type: Number, required: true, min: 1 }, note: { type: String, default: "" } },
  { timestamps: true }
);

const debtSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: [true, "Mijoz ismi kiritilishi shart"], trim: true },
    customerPhone: { type: String, default: "", trim: true },
    totalAmount: { type: Number, required: [true, "Qarz summasi kiritilishi shart"], min: 1 },
    paidAmount: { type: Number, default: 0, min: 0 },
    note: { type: String, default: "" },
    payments: [paymentSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

debtSchema.virtual("remaining").get(function () {
  return Math.max(this.totalAmount - this.paidAmount, 0);
});
debtSchema.virtual("isClosed").get(function () {
  return this.paidAmount >= this.totalAmount;
});
debtSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Debt", debtSchema);

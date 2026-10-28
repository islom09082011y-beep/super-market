const mongoose = require("mongoose");

// Onlayn to'lov tranzaksiyalari (Click, Payme va test rejimi)
const paymentSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    provider: { type: String, enum: ["click", "payme", "sandbox"], required: true },
    providerTransId: { type: String, default: "", index: true }, // Click: click_trans_id, Payme: params.id
    amount: { type: Number, required: true }, // so'mda
    // 1 = yaratilgan (kutilmoqda), 2 = to'langan, -1 = to'lovdan oldin bekor, -2 = to'lovdan keyin bekor
    state: { type: Number, enum: [1, 2, -1, -2], default: 1 },
    reason: { type: Number, default: null },
    providerTime: { type: Number, default: 0 }, // Payme "time" (ms)
    createTime: { type: Number, default: () => Date.now() },
    performTime: { type: Number, default: 0 },
    cancelTime: { type: Number, default: 0 },
    cardLast4: { type: String, default: "" }, // faqat test rejimida, to'liq karta raqami saqlanmaydi
  },
  { timestamps: true }
);

paymentSchema.index({ provider: 1, providerTransId: 1 });

module.exports = mongoose.model("Payment", paymentSchema);

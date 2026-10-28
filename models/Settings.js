const mongoose = require("mongoose");

// Do'kon sozlamalari — faqat bitta hujjat saqlanadi (singleton).
// Admin "Sozlamalar" bo'limidan shu ma'lumotlarni tahrirlaydi, xaridor
// tomonidagi bosh sahifa banneri va aloqa ma'lumotlari shundan o'qiladi.
const settingsSchema = new mongoose.Schema(
  {
    storeName: { type: String, default: "ShopEase" },
    logoUrl: { type: String, default: "" }, // bo'sh bo'lsa harf (S) belgili standart logotip ko'rsatiladi
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },

    heroBadge: { type: String, default: "Bugungi bozor — uyingizga" },
    heroTitle: { type: String, default: "ShopEase bilan xarid qiling, vaqtingizni tejang" },
    heroSubtitle: {
      type: String,
      default: "Yangi mahsulotlar va tezkor yetkazib berish — barchasi bir joyda.",
    },
    // Yetkazib berish hududlari: faqat shu hududlarga buyurtma qabul qilinadi
    deliveryRegions: { type: [String], default: ["Toshkent"] },
    minOrderAmount: { type: Number, default: 0 },
    pickupAddress: { type: String, default: "" }, // "o'zim olib ketaman" punkti manzili (bo'sh = o'chiq)
    deliveryFee: { type: Number, default: 0 }, // yetkazib berish haqi (so'm)
    freeDeliveryFrom: { type: Number, default: 0 }, // shu summadan oshsa yetkazish bepul (0 = o'chiq)

    heroImageUrl: { type: String, default: "" }, // bo'sh bo'lsa standart ikonka ko'rsatiladi
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);

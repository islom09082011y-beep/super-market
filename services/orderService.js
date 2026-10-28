// Buyurtmalar bilan ishlaydigan umumiy mantiq (controller, to'lov, AI yordamchi va avtomatik vazifalar uchun)
const Order = require("../models/Order");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const User = require("../models/User");
const mongoose = require("mongoose");
const { fail } = require("../utils/orderRules");

// Status o'tish qoidalari: faqat oldinga, bir qadamdan
const TRANSITIONS = {
  yangi: ["tasdiqlandi"],
  tasdiqlandi: ["yigilmoqda"],
  yigilmoqda: ["yetkazilmoqda"],
  yetkazilmoqda: ["yetkazildi"],
  yetkazildi: [],
  bekor_qilindi: [],
};
const STATUS_LABELS = {
  yangi: "Yangi",
  tasdiqlandi: "Tasdiqlandi",
  yigilmoqda: "Yig'ilmoqda",
  yetkazilmoqda: "Yetkazilmoqda",
  yetkazildi: "Yetkazildi",
  bekor_qilindi: "Bekor qilindi",
};
// Olib ketish buyurtmasida kuryer bosqichi yo'q: "Yig'ilmoqda" dan to'g'ridan-to'g'ri "Topshirildi"ga o'tadi
const allowedNext = (order) =>
  order.deliveryType === "olib_ketish" && order.status === "yigilmoqda" ? ["yetkazildi"] : TRANSITIONS[order.status] || [];

const COURIER_ALLOWED_FROM = ["yigilmoqda", "yetkazilmoqda"];
const ONLINE_METHODS = ["karta", "click", "payme"];

// Mahsulotlarni omborga qaytarish (bekor qilish yoki xato bo'lganda)
const restock = async (items) => {
  for (const item of items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity, soldCount: -item.quantity },
    });
  }
};

const releaseCoupon = async (couponId) => {
  if (!couponId) return;
  await Coupon.findOneAndUpdate({ _id: couponId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
};

// Buyurtmani ATOMIK bekor qilish (filter shartlari bajarilmasa null qaytaradi). Ombor va promo-kod tiklanadi.
const cancelOrderCore = async ({ filter, cancelledBy, reason, userId }) => {
  const order = await Order.findOneAndUpdate(
    { ...filter, status: filter.status || { $ne: "bekor_qilindi" } },
    {
      $set: { status: "bekor_qilindi", cancelReason: reason, cancelledBy },
      $push: { statusHistory: { status: "bekor_qilindi", by: userId || null, note: reason } },
    },
    { new: true }
  );
  if (order) {
    await restock(order.items);
    await releaseCoupon(order.coupon);
  }
  return order;
};

// Statusni bir qadam oldinga siljitish (qoidalarni tekshiradi). Xatoda fail() orqali tashlaydi.
const transitionOrder = async (res, order, status, user, courierId) => {
  if (!STATUS_LABELS[status]) fail(res, 400, "Noto'g'ri status qiymati");
  if (status === "bekor_qilindi") {
    fail(res, 400, "Buyurtmani bekor qilish uchun \"Bekor qilish\" amalidan foydalaning (ombor qoldig'i qaytariladi)");
  }
  if (!allowedNext(order).includes(status)) {
    fail(res, 400, `"${STATUS_LABELS[order.status]}" holatidan "${STATUS_LABELS[status]}" holatiga o'tib bo'lmaydi`);
  }
  if (status === "tasdiqlandi" && ONLINE_METHODS.includes(order.paymentMethod) && !order.isPaid) {
    fail(res, 400, "Onlayn to'lov hali kelmagan. To'lov tushmaguncha buyurtmani tasdiqlab bo'lmaydi");
  }

  const set = { status };
  if (status === "yetkazildi" && !order.isPaid) {
    set.isPaid = true; // naqd to'lov: yetkazilganda pul olingan hisoblanadi
    set.paidAt = new Date();
    if (!order.paymentProvider) set.paymentProvider = "manual";
  }

  if (user.role === "courier") {
    if (!COURIER_ALLOWED_FROM.includes(order.status)) {
      fail(res, 403, "Kuryer faqat yig'ilgan va yo'ldagi buyurtmalar statusini o'zgartira oladi");
    }
    if (order.courier && order.courier.toString() !== user._id.toString()) {
      fail(res, 403, "Bu buyurtma boshqa kuryerga biriktirilgan");
    }
    set.courier = user._id;
  } else if (courierId) {
    if (!mongoose.isValidObjectId(courierId)) fail(res, 400, "Kuryer identifikatori noto'g'ri");
    const c = await User.findOne({ _id: courierId, role: "courier", isBlocked: false });
    if (!c) fail(res, 400, "Kuryer topilmadi yoki bloklangan");
    set.courier = c._id;
  }

  // Boshqa foydalanuvchi bir vaqtda o'zgartirgan bo'lsa, rad etamiz
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set: set, $push: { statusHistory: { status, by: user._id } } },
    { new: true }
  );
  if (!updated) fail(res, 409, "Buyurtma holati boshqa foydalanuvchi tomonidan o'zgartirildi. Sahifani yangilang");
  return updated;
};

// To'lovni ATOMIK qabul qilish. Allaqachon to'langan bo'lsa null qaytaradi.
const markOrderPaid = async (orderId, provider, note) =>
  Order.findOneAndUpdate(
    { _id: orderId, isPaid: false, status: { $ne: "bekor_qilindi" } },
    {
      $set: { isPaid: true, paidAt: new Date(), paymentProvider: provider, paymentExpiresAt: null },
      $push: { statusHistory: { status: "tolov", note: note || `To'lov qabul qilindi (${provider})` } },
    },
    { new: true }
  );

module.exports = {
  TRANSITIONS,
  STATUS_LABELS,
  COURIER_ALLOWED_FROM,
  ONLINE_METHODS,
  allowedNext,
  restock,
  releaseCoupon,
  cancelOrderCore,
  transitionOrder,
  markOrderPaid,
};

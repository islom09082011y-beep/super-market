// To'lanmagan onlayn buyurtmalarni avtomatik bekor qiladi (ombor qoldig'i qaytariladi)
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const { cancelOrderCore } = require("../services/orderService");

const runOnce = async () => {
  const expired = await Order.find({
    isPaid: false,
    status: "yangi",
    paymentExpiresAt: { $ne: null, $lte: new Date() },
  }).select("_id");

  let cancelled = 0;
  for (const o of expired) {
    // Provayderda hali "to'lov jarayonida" tranzaksiya bo'lsa, tegmaymiz
    const pending = await Payment.exists({ order: o._id, state: 1, createTime: { $gt: Date.now() - 15 * 60 * 1000 } });
    if (pending) continue;
    const done = await cancelOrderCore({
      filter: { _id: o._id, isPaid: false, status: "yangi" },
      cancelledBy: "system",
      reason: "Onlayn to'lov muddati tugadi",
    });
    if (done) cancelled += 1;
  }
  return cancelled;
};

const start = (intervalMs = 5 * 60 * 1000) => {
  const timer = setInterval(() => runOnce().catch((e) => console.error("To'lov muddati vazifasi xatosi:", e.message)), intervalMs);
  timer.unref();
  return timer;
};

module.exports = { runOnce, start };

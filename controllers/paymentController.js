const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const { markOrderPaid, cancelOrderCore } = require("../services/orderService");
const { sandboxEnabled, clickConfigured, paymeConfigured, paymeKey, resolveProvider, buildPaymentInfo } = require("../services/paymentService");

const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const findOrder = (id) => (mongoose.isValidObjectId(id) ? Order.findById(id) : null);

/* =====================================================================
 *  CLICK (Shop API): prepare -> complete
 *  Hujjat: https://docs.click.uz/click-api-request/
 * ===================================================================== */
const clickSign = (p, withPrepare) =>
  md5(
    `${p.click_trans_id}${p.service_id}${process.env.CLICK_SECRET_KEY}${p.merchant_trans_id}` +
      `${withPrepare ? p.merchant_prepare_id : ""}${p.amount}${p.action}${p.sign_time}`
  );

const clickReply = (res, base, error, note, extra = {}) =>
  res.json({ ...base, ...extra, error, error_note: note });

const clickPrepare = asyncHandler(async (req, res) => {
  const p = req.body || {};
  const base = { click_trans_id: p.click_trans_id, merchant_trans_id: p.merchant_trans_id };
  if (!clickConfigured()) return clickReply(res, base, -8, "Click sozlanmagan");
  if (String(p.service_id) !== String(process.env.CLICK_SERVICE_ID) || !safeEqual(clickSign(p, false), p.sign_string)) {
    return clickReply(res, base, -1, "SIGN CHECK FAILED!");
  }
  if (Number(p.action) !== 0) return clickReply(res, base, -3, "Action not found");

  const order = await findOrder(p.merchant_trans_id);
  if (!order) return clickReply(res, base, -5, "Order not found");
  if (order.status === "bekor_qilindi") return clickReply(res, base, -9, "Order cancelled");
  if (order.isPaid) return clickReply(res, base, -4, "Already paid");
  if (Math.abs(Number(p.amount) - order.totalAmount) > 0.01) return clickReply(res, base, -2, "Incorrect parameter amount");

  let payment = await Payment.findOne({ provider: "click", providerTransId: String(p.click_trans_id), order: order._id });
  if (!payment) {
    payment = await Payment.create({
      order: order._id,
      provider: "click",
      providerTransId: String(p.click_trans_id),
      amount: order.totalAmount,
      state: 1,
    });
  }
  return clickReply(res, base, 0, "Success", { merchant_prepare_id: String(payment._id) });
});

const clickComplete = asyncHandler(async (req, res) => {
  const p = req.body || {};
  const base = { click_trans_id: p.click_trans_id, merchant_trans_id: p.merchant_trans_id };
  if (!clickConfigured()) return clickReply(res, base, -8, "Click sozlanmagan");
  if (String(p.service_id) !== String(process.env.CLICK_SERVICE_ID) || !safeEqual(clickSign(p, true), p.sign_string)) {
    return clickReply(res, base, -1, "SIGN CHECK FAILED!");
  }
  if (Number(p.action) !== 1) return clickReply(res, base, -3, "Action not found");

  const payment = mongoose.isValidObjectId(p.merchant_prepare_id) ? await Payment.findById(p.merchant_prepare_id) : null;
  if (!payment || payment.provider !== "click" || String(payment.order) !== String(p.merchant_trans_id)) {
    return clickReply(res, base, -6, "Transaction does not exist");
  }
  const order = await findOrder(p.merchant_trans_id);
  if (!order) return clickReply(res, base, -5, "Order not found");
  if (Math.abs(Number(p.amount) - payment.amount) > 0.01) return clickReply(res, base, -2, "Incorrect parameter amount");

  if (payment.state === 2) return clickReply(res, base, -4, "Already paid");
  if (payment.state < 0) return clickReply(res, base, -9, "Transaction cancelled");

  if (Number(p.error) < 0) {
    payment.state = -1;
    payment.cancelTime = Date.now();
    await payment.save();
    return clickReply(res, base, -9, "Transaction cancelled");
  }

  const paid = await markOrderPaid(order._id, "click", "To'lov qabul qilindi (Click)");
  if (!paid) return clickReply(res, base, order.status === "bekor_qilindi" ? -9 : -4, "Order not payable");
  payment.state = 2;
  payment.performTime = Date.now();
  await payment.save();
  return clickReply(res, base, 0, "Success", { merchant_confirm_id: String(payment._id) });
});

/* =====================================================================
 *  PAYME (Merchant API, JSON-RPC)
 *  Hujjat: https://developer.help.paycom.uz/
 * ===================================================================== */
const PAYME_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const msg = (uz, ru, en) => ({ uz, ru: ru || uz, en: en || uz });

class RpcError extends Error {
  constructor(code, message, data) {
    super(typeof message === "string" ? message : message.uz);
    this.rpc = { code, message: typeof message === "string" ? msg(message) : message, data: data || null };
  }
}

const accountField = () => process.env.PAYME_ACCOUNT_FIELD || "order_id";

const checkPerform = async (params) => {
  const orderId = params && params.account && params.account[accountField()];
  const order = await findOrder(orderId);
  if (!order) throw new RpcError(-31050, msg("Buyurtma topilmadi", "Заказ не найден", "Order not found"), accountField());
  if (!Number.isInteger(params.amount) || params.amount !== Math.round(order.totalAmount * 100)) {
    throw new RpcError(-31001, msg("Noto'g'ri summa", "Неверная сумма", "Incorrect amount"));
  }
  if (order.isPaid || order.status === "bekor_qilindi") {
    throw new RpcError(-31051, msg("Buyurtma to'lov uchun mavjud emas", "Заказ недоступен для оплаты", "Order is not payable"), accountField());
  }
  return order;
};

const txView = (t) => ({
  create_time: t.createTime,
  perform_time: t.performTime || 0,
  cancel_time: t.cancelTime || 0,
  transaction: String(t._id),
  state: t.state,
  reason: t.reason,
});

const paymeMethods = {
  async CheckPerformTransaction(params) {
    await checkPerform(params);
    return { allow: true };
  },

  async CreateTransaction(params) {
    let t = await Payment.findOne({ provider: "payme", providerTransId: String(params.id) });
    if (t) {
      if (t.state !== 1) throw new RpcError(-31008, msg("Tranzaksiyani bajarib bo'lmaydi"));
      if (Date.now() - t.createTime > PAYME_TIMEOUT_MS) {
        t.state = -1;
        t.reason = 4;
        t.cancelTime = Date.now();
        await t.save();
        throw new RpcError(-31008, msg("Tranzaksiya muddati tugagan"));
      }
      return { create_time: t.createTime, transaction: String(t._id), state: t.state };
    }

    const order = await checkPerform(params);
    const busy = await Payment.findOne({ order: order._id, provider: "payme", state: 1 });
    if (busy) {
      throw new RpcError(-31051, msg("Buyurtma uchun boshqa to'lov kutilmoqda", "Для заказа ожидается другая оплата", "Another payment is pending"), accountField());
    }
    t = await Payment.create({
      order: order._id,
      provider: "payme",
      providerTransId: String(params.id),
      providerTime: Number(params.time) || 0,
      amount: order.totalAmount,
      state: 1,
    });
    return { create_time: t.createTime, transaction: String(t._id), state: 1 };
  },

  async PerformTransaction(params) {
    const t = await Payment.findOne({ provider: "payme", providerTransId: String(params.id) });
    if (!t) throw new RpcError(-31003, msg("Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found"));
    if (t.state === 2) return { transaction: String(t._id), perform_time: t.performTime, state: 2 };
    if (t.state !== 1) throw new RpcError(-31008, msg("Tranzaksiyani bajarib bo'lmaydi"));

    if (Date.now() - t.createTime > PAYME_TIMEOUT_MS) {
      t.state = -1;
      t.reason = 4;
      t.cancelTime = Date.now();
      await t.save();
      throw new RpcError(-31008, msg("Tranzaksiya muddati tugagan"));
    }
    const paid = await markOrderPaid(t.order, "payme", "To'lov qabul qilindi (Payme)");
    if (!paid) throw new RpcError(-31008, msg("Buyurtma to'lov uchun mavjud emas"));
    t.state = 2;
    t.performTime = Date.now();
    await t.save();
    return { transaction: String(t._id), perform_time: t.performTime, state: 2 };
  },

  async CancelTransaction(params) {
    const t = await Payment.findOne({ provider: "payme", providerTransId: String(params.id) });
    if (!t) throw new RpcError(-31003, msg("Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found"));

    if (t.state === 1) {
      t.state = -1;
    } else if (t.state === 2) {
      const order = await Order.findById(t.order);
      if (order && ["yetkazilmoqda", "yetkazildi"].includes(order.status)) {
        throw new RpcError(-31007, msg("Buyurtma yetkazilgan, to'lovni bekor qilib bo'lmaydi", "Заказ доставлен, отмена невозможна", "Order delivered, cannot cancel"));
      }
      t.state = -2;
      // Pul qaytarildi: buyurtma ham bekor qilinadi, ombor qoldig'i tiklanadi
      await cancelOrderCore({
        filter: { _id: t.order },
        cancelledBy: "system",
        reason: "To'lov Payme tomonidan qaytarildi",
      });
      await Order.findByIdAndUpdate(t.order, { $set: { isPaid: false } });
    } else {
      return { transaction: String(t._id), cancel_time: t.cancelTime, state: t.state };
    }
    t.reason = params.reason === undefined ? null : params.reason;
    t.cancelTime = Date.now();
    await t.save();
    return { transaction: String(t._id), cancel_time: t.cancelTime, state: t.state };
  },

  async CheckTransaction(params) {
    const t = await Payment.findOne({ provider: "payme", providerTransId: String(params.id) });
    if (!t) throw new RpcError(-31003, msg("Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found"));
    return txView(t);
  },

  async GetStatement(params) {
    const list = await Payment.find({
      provider: "payme",
      providerTime: { $gte: Number(params.from), $lte: Number(params.to) },
    }).sort({ providerTime: 1 });
    return {
      transactions: list.map((t) => ({
        id: t.providerTransId,
        time: t.providerTime,
        amount: Math.round(t.amount * 100),
        account: { [accountField()]: String(t.order) },
        ...txView(t),
      })),
    };
  },
};

const paymeEndpoint = asyncHandler(async (req, res) => {
  const { id = null, method, params = {} } = req.body || {};
  const respondError = (e) => res.status(200).json({ error: e.rpc, id });

  // Payme har doim HTTP 200 kutadi, xatolar JSON ichida qaytariladi
  const expected = `Basic ${Buffer.from(`Paycom:${paymeKey() || ""}`).toString("base64")}`;
  if (!paymeConfigured() || !safeEqual(req.headers.authorization || "", expected)) {
    return respondError(new RpcError(-32504, msg("Ruxsat yo'q", "Недостаточно привилегий", "Insufficient privilege")));
  }
  if (!paymeMethods[method]) {
    return respondError(new RpcError(-32601, msg("Metod topilmadi", "Метод не найден", "Method not found")));
  }
  try {
    const result = await paymeMethods[method](params);
    return res.status(200).json({ result, id });
  } catch (err) {
    if (err instanceof RpcError) return respondError(err);
    console.error("Payme xatosi:", err);
    return respondError(new RpcError(-32400, msg("Ichki xato", "Внутренняя ошибка", "Internal error")));
  }
});

/* =====================================================================
 *  SANDBOX (test rejimi): haqiqiy pul harakatlanmaydi
 * ===================================================================== */
const luhn = (num) => {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
};

const TEST_CARDS = {
  "4242424242424242": { ok: true },
  "4000000000000002": { ok: false, message: "Karta rad etildi (test)" },
  "4000000000009995": { ok: false, message: "Kartada mablag' yetarli emas (test)" },
};

// @route POST /api/payments/sandbox/pay   body: { orderId, cardNumber, expiry (MM/YY) }
const sandboxPay = asyncHandler(async (req, res) => {
  if (!sandboxEnabled()) {
    res.status(404);
    throw new Error("Test to'lov rejimi o'chirilgan");
  }
  const { orderId, cardNumber, expiry } = req.body || {};
  const digits = String(cardNumber || "").replace(/\s/g, "");
  if (!/^\d{16}$/.test(digits) || !luhn(digits)) {
    res.status(400);
    throw new Error("Karta raqami noto'g'ri");
  }
  const m = /^(\d{2})\/(\d{2})$/.exec(String(expiry || ""));
  const month = m ? Number(m[1]) : 0;
  const year = m ? 2000 + Number(m[2]) : 0;
  if (!m || month < 1 || month > 12 || new Date(year, month, 1) <= new Date()) {
    res.status(400);
    throw new Error("Karta amal qilish muddati noto'g'ri yoki tugagan (MM/YY)");
  }

  const order = mongoose.isValidObjectId(orderId) ? await Order.findOne({ _id: orderId, user: req.user._id }) : null;
  if (!order) {
    res.status(404);
    throw new Error("Buyurtma topilmadi");
  }
  if (order.isPaid) {
    res.status(400);
    throw new Error("Bu buyurtma allaqachon to'langan");
  }
  if (order.status === "bekor_qilindi") {
    res.status(400);
    throw new Error("Bekor qilingan buyurtmani to'lab bo'lmaydi");
  }

  const card = TEST_CARDS[digits];
  if (card && !card.ok) {
    res.status(402);
    throw new Error(card.message);
  }

  const paid = await markOrderPaid(order._id, "sandbox", "To'lov qabul qilindi (test rejimi)");
  if (!paid) {
    res.status(409);
    throw new Error("Buyurtma holati o'zgargan, qayta urinib ko'ring");
  }
  await Payment.create({
    order: order._id,
    provider: "sandbox",
    providerTransId: `sbx_${Date.now()}`,
    amount: order.totalAmount,
    state: 2,
    performTime: Date.now(),
    cardLast4: digits.slice(-4),
  });
  res.json({ success: true, data: paid });
});

// @route GET /api/payments/order/:id   — to'lov holatini tekshirish (xaridor)
const paymentStatus = asyncHandler(async (req, res) => {
  const order = mongoose.isValidObjectId(req.params.id)
    ? await Order.findOne({ _id: req.params.id, user: req.user._id }).select(
        "orderNumber totalAmount isPaid status paymentMethod paymentProvider paymentExpiresAt"
      )
    : null;
  if (!order) {
    res.status(404);
    throw new Error("Buyurtma topilmadi");
  }
  res.json({ success: true, data: order, sandbox: sandboxEnabled() });
});

// @desc    To'lanmagan onlayn buyurtma uchun to'lov sahifasi ma'lumotini qayta olish
// @route   POST /api/payments/order/:id/start
const startPayment = asyncHandler(async (req, res) => {
  const order = mongoose.isValidObjectId(req.params.id) ? await Order.findOne({ _id: req.params.id, user: req.user._id }) : null;
  if (!order) {
    res.status(404);
    throw new Error("Buyurtma topilmadi");
  }
  if (order.isPaid) {
    res.status(400);
    throw new Error("Bu buyurtma allaqachon to'langan");
  }
  if (order.status === "bekor_qilindi") {
    res.status(400);
    throw new Error("Bekor qilingan buyurtmani to'lab bo'lmaydi");
  }
  const provider = resolveProvider(order.paymentMethod);
  if (!provider) {
    res.status(400);
    throw new Error("Bu buyurtma onlayn to'lov uchun mo'ljallanmagan");
  }
  if (order.paymentExpiresAt && order.paymentExpiresAt < new Date()) {
    res.status(400);
    throw new Error("To'lov muddati tugagan. Yangi buyurtma bering");
  }
  res.json({ success: true, payment: buildPaymentInfo(order, provider) });
});

module.exports = { startPayment, clickPrepare, clickComplete, paymeEndpoint, sandboxPay, paymentStatus, luhn };

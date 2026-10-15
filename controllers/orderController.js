const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const Settings = require("../models/Settings");
const Counter = require("../models/Counter");
const User = require("../models/User");

const PAYMENT_METHODS = ["naqd", "karta", "click", "payme"];
const MAX_QTY_PER_ITEM = 100;
const UZ_PHONE = /^\+?998\d{9}$/;

// Yetkazib berish vaqt oraliqlari -> boshlanish soati (Toshkent vaqti, UTC+5)
const SLOT_START = { "09:00-12:00": 9, "12:00-17:00": 12, "17:00-21:00": 17 };
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

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
const COURIER_ALLOWED_FROM = ["yigilmoqda", "yetkazilmoqda"];

const fail = (res, status, message) => {
  res.status(status);
  throw new Error(message);
};

const getSettings = async () => (await Settings.findOne()) || (await Settings.create({}));

const nextOrderNumber = async () => {
  const c = await Counter.findOneAndUpdate({ _id: "order" }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `SE-${String(c.seq).padStart(6, "0")}`;
};

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

const calcDeliveryFee = (settings, amountAfterDiscount) => {
  const fee = settings.deliveryFee || 0;
  if (settings.freeDeliveryFrom > 0 && amountAfterDiscount >= settings.freeDeliveryFrom) return 0;
  return fee;
};

const validateSlot = (res, slot) => {
  const date = slot && slot.date ? String(slot.date) : "";
  const time = slot && slot.slot ? String(slot.slot) : "";
  if (!date && !time) return { date: "", slot: "" };
  if (!date || !time) fail(res, 400, "Yetkazib berish sanasi va vaqtini birga tanlang");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    fail(res, 400, "Yetkazib berish sanasi noto'g'ri");
  }
  if (!(time in SLOT_START)) fail(res, 400, "Yetkazib berish vaqti noto'g'ri");

  const nowTk = new Date(Date.now() + TASHKENT_OFFSET_MS);
  const today = nowTk.toISOString().slice(0, 10);
  const max = new Date(nowTk.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (date < today || date > max) fail(res, 400, "Yetkazib berish sanasi bugundan boshlab 7 kun ichida bo'lishi kerak");
  if (date === today && SLOT_START[time] < nowTk.getUTCHours() + 2) {
    fail(res, 400, "Bu vaqt oralig'iga buyurtma qabul qilish muddati o'tgan. Keyingi oraliqni tanlang");
  }
  return { date, slot: time };
};

// @desc    Yangi buyurtma yaratish (checkout) — qat'iy tekshiruvlar bilan
//          body: { items:[{product,quantity}], couponCode, paymentMethod, note,
//                  deliverySlot:{date,slot}, deliveryAddress:{ region, address, phone, lat, lng } }
// @route   POST /api/orders
// @access  Private (faqat xaridor)
const createOrder = asyncHandler(async (req, res) => {
  const { items, couponCode, paymentMethod, deliveryAddress, deliverySlot, note } = req.body;

  // 1) Faqat xaridorlar buyurtma bera oladi
  if (req.user.role !== "customer") {
    fail(res, 403, "Xodimlar do'kondan buyurtma bera olmaydi");
  }

  // 2) Savatcha tekshiruvi (bir xil mahsulot takrorlansa birlashtiramiz)
  if (!Array.isArray(items) || items.length === 0) fail(res, 400, "Savatcha bo'sh");
  const merged = new Map();
  for (const item of items) {
    const qty = Number(item.quantity);
    if (!mongoose.isValidObjectId(item.product)) fail(res, 400, "Noto'g'ri mahsulot identifikatori");
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) {
      fail(res, 400, `Mahsulot miqdori 1 dan ${MAX_QTY_PER_ITEM} gacha butun son bo'lishi kerak`);
    }
    const key = String(item.product);
    merged.set(key, (merged.get(key) || 0) + qty);
  }

  // 3) Yetkazib berish joyi — majburiy va qat'iy tekshiriladi
  const settings = await getSettings();
  const addr = deliveryAddress || {};
  const region = String(addr.region || "").trim();
  const address = String(addr.address || "").trim();
  const phone = String(addr.phone || "").replace(/[\s()-]/g, "");

  if (!region) fail(res, 400, "Yetkazib berish hududini tanlang");
  const allowed = (settings.deliveryRegions || []).map((r) => r.toLowerCase());
  if (allowed.length && !allowed.includes(region.toLowerCase())) {
    fail(res, 400, `"${region}" hududiga yetkazib berilmaydi. Mavjud hududlar: ${settings.deliveryRegions.join(", ")}`);
  }
  if (address.length < 10) fail(res, 400, "To'liq manzilni kiriting (ko'cha, uy raqami)");
  if (!UZ_PHONE.test(phone)) fail(res, 400, "Telefon raqami noto'g'ri. Namuna: +998901234567");

  let lat = null;
  let lng = null;
  if (addr.lat !== undefined && addr.lat !== null && addr.lat !== "") {
    lat = Number(addr.lat);
    lng = Number(addr.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      fail(res, 400, "Joylashuv koordinatalari noto'g'ri");
    }
  }

  // 4) To'lov usuli, izoh, yetkazib berish vaqti
  const method = paymentMethod || "naqd";
  if (!PAYMENT_METHODS.includes(method)) fail(res, 400, "Noto'g'ri to'lov usuli");
  const cleanNote = String(note || "").trim();
  if (cleanNote.length > 300) fail(res, 400, "Izoh 300 belgidan oshmasligi kerak");
  const slot = validateSlot(res, deliverySlot);

  // 5) Mahsulot, narx va qoldiq — narx har doim bazadan olinadi
  const orderItems = [];
  let subtotal = 0;
  for (const [productId, quantity] of merged) {
    const product = await Product.findById(productId);
    if (!product || !product.isActive) fail(res, 404, "Savatdagi mahsulot topilmadi yoki sotuvdan olingan");
    if (product.stock < quantity) {
      fail(res, 400, `"${product.name}" mahsulotidan yetarli qoldiq yo'q (mavjud: ${product.stock})`);
    }
    orderItems.push({ product: product._id, name: product.name, price: product.price, quantity });
    subtotal += product.price * quantity;
  }

  if (settings.minOrderAmount && subtotal < settings.minOrderAmount) {
    fail(res, 400, `Minimal buyurtma summasi: ${settings.minOrderAmount.toLocaleString("ru-RU")} so'm`);
  }

  // 6) Promo-kod
  let discountAmount = 0;
  let couponDoc = null;
  if (couponCode) {
    couponDoc = await Coupon.findOne({ code: String(couponCode).toUpperCase() });
    if (!couponDoc || !couponDoc.isValid(subtotal)) fail(res, 400, "Promo-kod yaroqsiz yoki shartlarga mos kelmaydi");
    discountAmount =
      couponDoc.discountType === "percent"
        ? (subtotal * couponDoc.discountValue) / 100
        : couponDoc.discountValue;
    discountAmount = Math.min(Math.round(discountAmount), subtotal);
  }
  const afterDiscount = subtotal - discountAmount;
  const deliveryFee = calcDeliveryFee(settings, afterDiscount);
  const totalAmount = afterDiscount + deliveryFee;

  // 7) Ombordan qoldiqni ATOMIK ayirish (bir vaqtda ikki buyurtma qoldiqni minusga tushirmasin)
  const reserved = [];
  for (const item of orderItems) {
    const updated = await Product.findOneAndUpdate(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity, soldCount: item.quantity } }
    );
    if (!updated) {
      await restock(reserved);
      fail(res, 409, `"${item.name}" qoldig'i hozirgina tugab qoldi. Savatni yangilang`);
    }
    reserved.push(item);
  }

  // 8) Promo-kod limitini ATOMIK band qilish
  if (couponDoc) {
    const claimed = await Coupon.findOneAndUpdate(
      {
        _id: couponDoc._id,
        $or: [{ maxUsage: null }, { $expr: { $lt: ["$usedCount", "$maxUsage"] } }],
      },
      { $inc: { usedCount: 1 } }
    );
    if (!claimed) {
      await restock(reserved);
      fail(res, 409, "Promo-kodning ishlatish limiti hozirgina tugadi");
    }
  }

  // 9) Buyurtmani yaratish
  let order;
  try {
    order = await Order.create({
      orderNumber: await nextOrderNumber(),
      user: req.user._id,
      items: orderItems,
      subtotal,
      coupon: couponDoc ? couponDoc._id : null,
      discountAmount,
      deliveryFee,
      totalAmount,
      paymentMethod: method,
      note: cleanNote,
      deliverySlot: slot,
      deliveryAddress: { region, address, phone, lat, lng },
      statusHistory: [{ status: "yangi", by: req.user._id, note: "Buyurtma qabul qilindi" }],
    });
  } catch (err) {
    await restock(reserved);
    if (couponDoc) await releaseCoupon(couponDoc._id);
    throw err;
  }

  res.status(201).json({ success: true, data: order });
});

// @desc    Savatni oldindan tekshirish: narx, qoldiq va mavjudlik (checkout oldidan)
// @route   POST /api/orders/validate-cart
// @access  Private
const validateCart = asyncHandler(async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    fail(res, 400, "Savatcha bo'sh yoki juda katta");
  }
  const result = [];
  for (const item of items) {
    if (!mongoose.isValidObjectId(item.product)) {
      result.push({ product: String(item.product), status: "unavailable" });
      continue;
    }
    const p = await Product.findById(item.product);
    if (!p || !p.isActive || p.stock <= 0) {
      result.push({ product: String(item.product), status: "unavailable" });
    } else {
      result.push({
        product: String(p._id),
        name: p.name,
        price: p.price,
        stock: p.stock,
        image: (p.images && p.images[0]) || "",
        status: "ok",
      });
    }
  }
  res.json({ success: true, data: result });
});

// @desc    Xaridorning o'z buyurtmalari
// @route   GET /api/orders/my
// @access  Private (xaridor)
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, count: orders.length, data: orders });
});

// @desc    Barcha buyurtmalar (admin panel uchun, filtr va qidiruv bilan)
//          /api/orders?status=yangi&from=2026-01-01&to=2026-01-31&search=SE-0001
// @route   GET /api/orders
// @access  Private/Admin/Manager/Cashier/Courier
const getOrders = asyncHandler(async (req, res) => {
  const { status, from, to, search } = req.query;
  const query = {};
  if (status) query.status = status;
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }
  if (search) {
    const s = String(search).trim().slice(0, 30);
    const rx = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ orderNumber: rx }, { "deliveryAddress.phone": rx }];
  }

  const orders = await Order.find(query)
    .populate("user", "name email phone")
    .populate("courier", "name phone")
    .sort({ createdAt: -1 });

  res.json({ success: true, count: orders.length, data: orders });
});

// @desc    Bitta buyurtmani olish
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri buyurtma identifikatori");
  const order = await Order.findById(req.params.id)
    .populate("user", "name email phone")
    .populate("courier", "name phone");

  if (!order) fail(res, 404, "Buyurtma topilmadi");

  // Xaridor faqat o'z buyurtmasini ko'ra oladi
  if (req.user.role === "customer" && order.user._id.toString() !== req.user._id.toString()) {
    fail(res, 403, "Bu buyurtmani ko'rishga ruxsatingiz yo'q");
  }

  res.json({ success: true, data: order });
});

// @desc    Buyurtma statusini o'zgartirish — faqat oldinga, bir qadamdan
//          Yangi -> Tasdiqlandi -> Yigilmoqda -> Yetkazilmoqda -> Yetkazildi
// @route   PATCH /api/orders/:id/status
// @access  Private/Admin/Manager/Courier
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, courier } = req.body;
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri buyurtma identifikatori");
  const order = await Order.findById(req.params.id);
  if (!order) fail(res, 404, "Buyurtma topilmadi");

  if (!STATUS_LABELS[status]) fail(res, 400, "Noto'g'ri status qiymati");
  if (status === "bekor_qilindi") {
    fail(res, 400, "Buyurtmani bekor qilish uchun \"Bekor qilish\" amalidan foydalaning (ombor qoldig'i qaytariladi)");
  }
  if (!(TRANSITIONS[order.status] || []).includes(status)) {
    fail(res, 400, `"${STATUS_LABELS[order.status]}" holatidan "${STATUS_LABELS[status]}" holatiga o'tib bo'lmaydi`);
  }

  const set = { status };
  if (status === "yetkazildi") set.isPaid = true;

  if (req.user.role === "courier") {
    if (!COURIER_ALLOWED_FROM.includes(order.status)) {
      fail(res, 403, "Kuryer faqat yig'ilgan va yo'ldagi buyurtmalar statusini o'zgartira oladi");
    }
    if (order.courier && order.courier.toString() !== req.user._id.toString()) {
      fail(res, 403, "Bu buyurtma boshqa kuryerga biriktirilgan");
    }
    set.courier = req.user._id;
  } else if (courier) {
    if (!mongoose.isValidObjectId(courier)) fail(res, 400, "Kuryer identifikatori noto'g'ri");
    const c = await User.findOne({ _id: courier, role: "courier", isBlocked: false });
    if (!c) fail(res, 400, "Kuryer topilmadi yoki bloklangan");
    set.courier = c._id;
  }

  // Boshqa foydalanuvchi bir vaqtda o'zgartirgan bo'lsa, rad etamiz
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set: set, $push: { statusHistory: { status, by: req.user._id } } },
    { new: true }
  );
  if (!updated) fail(res, 409, "Buyurtma holati boshqa foydalanuvchi tomonidan o'zgartirildi. Sahifani yangilang");

  res.json({ success: true, data: updated });
});

// @desc    Buyurtmani bekor qilish (xodim) - mahsulotlar omborga qaytariladi
// @route   PATCH /api/orders/:id/cancel
// @access  Private/Admin/Manager
const cancelOrder = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri buyurtma identifikatori");
  const reason = String(req.body.reason || "").trim().slice(0, 200);

  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, status: { $ne: "bekor_qilindi" } },
    {
      $set: { status: "bekor_qilindi", cancelReason: reason, cancelledBy: "staff" },
      $push: { statusHistory: { status: "bekor_qilindi", by: req.user._id, note: reason } },
    },
    { new: true }
  );

  if (!order) {
    const exists = await Order.exists({ _id: req.params.id });
    fail(res, exists ? 400 : 404, exists ? "Buyurtma allaqachon bekor qilingan" : "Buyurtma topilmadi");
  }

  await restock(order.items);
  await releaseCoupon(order.coupon);
  res.json({ success: true, data: order });
});

// @desc    Xaridor o'z buyurtmasini bekor qiladi (faqat "Yangi" holatida)
// @route   PATCH /api/orders/:id/customer-cancel
// @access  Private (xaridor)
const customerCancelOrder = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri buyurtma identifikatori");
  const reason = String(req.body.reason || "").trim().slice(0, 200) || "Xaridor tomonidan bekor qilindi";

  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id, status: "yangi" },
    {
      $set: { status: "bekor_qilindi", cancelReason: reason, cancelledBy: "customer" },
      $push: { statusHistory: { status: "bekor_qilindi", by: req.user._id, note: reason } },
    },
    { new: true }
  );

  if (!order) {
    const existing = await Order.findOne({ _id: req.params.id, user: req.user._id }).select("status");
    if (!existing) fail(res, 404, "Buyurtma topilmadi");
    if (existing.status === "bekor_qilindi") fail(res, 400, "Buyurtma allaqachon bekor qilingan");
    fail(res, 400, "Buyurtma tasdiqlangan, uni bekor qilish uchun do'kon bilan bog'laning");
  }

  await restock(order.items);
  await releaseCoupon(order.coupon);
  res.json({ success: true, data: order });
});

module.exports = {
  createOrder,
  validateCart,
  getMyOrders,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  customerCancelOrder,
};

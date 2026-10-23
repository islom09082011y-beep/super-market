const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const Settings = require("../models/Settings");
const Counter = require("../models/Counter");
const User = require("../models/User");
const { fail, validateSlot, validateAddress } = require("../utils/orderRules");
const { isValidDescriptor, distance, THRESHOLD, isLocked, registerFailure, clearFailures } = require("../utils/face");
const {
  STATUS_LABELS,
  ONLINE_METHODS,
  restock,
  releaseCoupon,
  cancelOrderCore,
  transitionOrder,
} = require("../services/orderService");
const { resolveProvider, buildPaymentInfo, PAYMENT_WINDOW_MS } = require("../services/paymentService");

const PAYMENT_METHODS = ["naqd", "karta", "click", "payme"];
const MAX_QTY_PER_ITEM = 100;

const getSettings = async () => (await Settings.findOne()) || (await Settings.create({}));
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const nextOrderNumber = async () => {
  const c = await Counter.findOneAndUpdate({ _id: "order" }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `SE-${String(c.seq).padStart(6, "0")}`;
};

const calcDeliveryFee = (settings, amountAfterDiscount) => {
  const fee = settings.deliveryFee || 0;
  if (settings.freeDeliveryFrom > 0 && amountAfterDiscount >= settings.freeDeliveryFrom) return 0;
  return fee;
};

// Yuz orqali tasdiqlash. true = tasdiqlandi, false = talab qilinmagan va yuborilmagan.
const verifyFace = async (res, userId, descriptor) => {
  const user = await User.findById(userId).select("+faceDescriptor faceRequiredForOrders");
  const enrolled = Array.isArray(user.faceDescriptor) && user.faceDescriptor.length === 128;
  const required = Boolean(user.faceRequiredForOrders && enrolled);

  if (!descriptor && !required) return false;
  if (!enrolled) fail(res, 400, "Yuz ma'lumoti saqlanmagan. Avval Profilda yuzingizni ro'yxatdan o'tkazing");
  if (!descriptor) fail(res, 403, "Buyurtmani yuz orqali tasdiqlash talab qilinadi");
  if (!isValidDescriptor(descriptor)) fail(res, 400, "Yuz ma'lumoti noto'g'ri");
  if (isLocked(userId)) fail(res, 429, "Juda ko'p muvaffaqiyatsiz urinish. 10 daqiqadan keyin qayta urinib ko'ring");
  if (distance(descriptor, user.faceDescriptor) > THRESHOLD) {
    registerFailure(userId);
    fail(res, 403, "Yuz mos kelmadi. Yorug'likni tekshirib qayta urinib ko'ring");
  }
  clearFailures(userId);
  return true;
};

// @desc    Yangi buyurtma yaratish (checkout) — qat'iy tekshiruvlar bilan
// @route   POST /api/orders
// @access  Private (faqat xaridor)
const createOrder = asyncHandler(async (req, res) => {
  const { items, couponCode, paymentMethod, deliveryAddress, deliverySlot, note, faceDescriptor } = req.body;

  // 1) Faqat xaridorlar buyurtma bera oladi
  if (req.user.role !== "customer") fail(res, 403, "Xodimlar do'kondan buyurtma bera olmaydi");

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
  const { region, address, phone, lat, lng } = validateAddress(res, deliveryAddress, settings);

  // 4) To'lov usuli, izoh, yetkazib berish vaqti
  const method = paymentMethod || "naqd";
  if (!PAYMENT_METHODS.includes(method)) fail(res, 400, "Noto'g'ri to'lov usuli");
  let provider = null;
  if (ONLINE_METHODS.includes(method)) {
    provider = resolveProvider(method);
    if (!provider) fail(res, 503, "Onlayn to'lov hozircha ulanmagan. Iltimos, naqd to'lovni tanlang");
  }
  const cleanNote = String(note || "").trim();
  if (cleanNote.length > 300) fail(res, 400, "Izoh 300 belgidan oshmasligi kerak");
  const slot = validateSlot(res, deliverySlot);

  // 5) Yuz orqali tasdiqlash (yoqilgan bo'lsa majburiy)
  const faceVerified = await verifyFace(res, req.user._id, faceDescriptor);

  // 6) Mahsulot, narx va qoldiq — narx har doim bazadan olinadi
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

  // 7) Promo-kod
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

  // 8) Ombordan qoldiqni ATOMIK ayirish
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

  // 9) Promo-kod limitini ATOMIK band qilish
  if (couponDoc) {
    const claimed = await Coupon.findOneAndUpdate(
      { _id: couponDoc._id, $or: [{ maxUsage: null }, { $expr: { $lt: ["$usedCount", "$maxUsage"] } }] },
      { $inc: { usedCount: 1 } }
    );
    if (!claimed) {
      await restock(reserved);
      fail(res, 409, "Promo-kodning ishlatish limiti hozirgina tugadi");
    }
  }

  // 10) Buyurtmani yaratish
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
      paymentExpiresAt: provider ? new Date(Date.now() + PAYMENT_WINDOW_MS) : null,
      faceVerified,
      note: cleanNote,
      deliverySlot: slot,
      deliveryAddress: { region, address, phone, lat, lng },
      statusHistory: [
        {
          status: "yangi",
          by: req.user._id,
          note: faceVerified ? "Buyurtma qabul qilindi (yuz orqali tasdiqlangan)" : "Buyurtma qabul qilindi",
        },
      ],
    });
  } catch (err) {
    await restock(reserved);
    if (couponDoc) await releaseCoupon(couponDoc._id);
    throw err;
  }

  res.status(201).json({
    success: true,
    data: order,
    payment: provider ? buildPaymentInfo(order, provider) : null,
  });
});

// @desc    Savatni oldindan tekshirish: narx, qoldiq va mavjudlik (checkout oldidan)
// @route   POST /api/orders/validate-cart
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
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, count: orders.length, data: orders });
});

// Kuryer faqat o'ziga biriktirilgan yoki "Yig'ilmoqda"dagi biriktirilmagan buyurtmalarni ko'radi
const courierScope = (user) => ({
  $or: [{ courier: user._id }, { courier: null, status: "yigilmoqda" }],
});

const parseDay = (value, end) => {
  if (!value) return null;
  const d = new Date(`${value}${end ? "T23:59:59.999" : "T00:00:00"}+05:00`); // Toshkent vaqti
  return Number.isNaN(d.getTime()) ? null : d;
};

// @desc    Buyurtmalar ro'yxati (filtr, qidiruv, saralash, sahifalash) — xodimlar uchun
// @route   GET /api/orders
const getOrders = asyncHandler(async (req, res) => {
  const { status, from, to, search, method, paid, courier, urgent, sort = "newest" } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

  const conds = [];
  if (req.user.role === "courier") conds.push(courierScope(req.user));

  const fromD = parseDay(from, false);
  const toD = parseDay(to, true);
  if (fromD || toD) conds.push({ createdAt: { ...(fromD ? { $gte: fromD } : {}), ...(toD ? { $lte: toD } : {}) } });
  if (method && PAYMENT_METHODS.includes(method)) conds.push({ paymentMethod: method });
  if (paid === "true") conds.push({ isPaid: true });
  if (paid === "false") conds.push({ isPaid: false, status: { $ne: "bekor_qilindi" } });
  if (urgent === "true") conds.push({ isUrgent: true });
  if (courier === "none") conds.push({ courier: null });
  else if (courier && mongoose.isValidObjectId(courier)) conds.push({ courier });
  if (search) {
    const s = String(search).trim().slice(0, 30);
    if (s) {
      const rx = new RegExp(escapeRx(s), "i");
      const users = await User.find({ name: rx }).select("_id").limit(50);
      conds.push({
        $or: [{ orderNumber: rx }, { "deliveryAddress.phone": rx }, { user: { $in: users.map((u) => u._id) } }],
      });
    }
  }

  const baseFilter = conds.length ? { $and: conds } : {};
  const filter = status && STATUS_LABELS[status] ? { $and: [...conds, { status }] } : baseFilter;

  const sorts = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    amount_desc: { totalAmount: -1 },
    amount_asc: { totalAmount: 1 },
  };

  const [total, data, countRows, sumRows] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter)
      .populate("user", "name email phone")
      .populate("courier", "name phone")
      .sort(sorts[sort] || sorts.newest)
      .skip((page - 1) * limit)
      .limit(limit),
    Order.aggregate([{ $match: baseFilter }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { ...filter, status: { $ne: "bekor_qilindi" } } },
      { $group: { _id: null, amount: { $sum: "$totalAmount" } } },
    ]),
  ]);

  const counts = Object.fromEntries(countRows.map((r) => [r._id, r.n]));
  res.json({
    success: true,
    data,
    total,
    page,
    pages: Math.max(Math.ceil(total / limit), 1),
    counts,
    summary: { amount: sumRows[0] ? sumRows[0].amount : 0 },
  });
});

// @desc    Bitta buyurtmani olish (xodimlar uchun mijoz statistikasi bilan)
// @route   GET /api/orders/:id
const getOrderById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri buyurtma identifikatori");
  const order = await Order.findById(req.params.id)
    .populate("user", "name email phone createdAt")
    .populate("courier", "name phone");
  if (!order) fail(res, 404, "Buyurtma topilmadi");

  const isCustomer = req.user.role === "customer";
  if (isCustomer && order.user._id.toString() !== req.user._id.toString()) {
    fail(res, 403, "Bu buyurtmani ko'rishga ruxsatingiz yo'q");
  }
  if (req.user.role === "courier") {
    const mine = order.courier && order.courier._id.toString() === req.user._id.toString();
    if (!mine && !(order.courier === null && order.status === "yigilmoqda")) {
      fail(res, 403, "Bu buyurtma sizga biriktirilmagan");
    }
  }

  const body = order.toObject();
  let customerStats = null;
  if (!isCustomer) {
    const rows = await Order.aggregate([
      { $match: { user: order.user._id, status: { $ne: "bekor_qilindi" } } },
      { $group: { _id: null, count: { $sum: 1 }, spent: { $sum: "$totalAmount" } } },
    ]);
    customerStats = rows[0] ? { orders: rows[0].count, spent: rows[0].spent } : { orders: 0, spent: 0 };
  } else {
    delete body.staffNote; // xodimlarning ichki izohi xaridorga ko'rsatilmaydi
  }
  res.json({ success: true, data: body, customerStats });
});

// @desc    Statusni bir qadam oldinga siljitish
// @route   PATCH /api/orders/:id/status
const updateOrderStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri buyurtma identifikatori");
  const order = await Order.findById(req.params.id);
  if (!order) fail(res, 404, "Buyurtma topilmadi");
  const updated = await transitionOrder(res, order, req.body.status, req.user, req.body.courier);
  res.json({ success: true, data: updated });
});

// @desc    Bir nechta buyurtmani bir vaqtda keyingi statusga o'tkazish
//          body: { ids: [...], status }
// @route   POST /api/orders/bulk-status
const bulkUpdateStatus = asyncHandler(async (req, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) fail(res, 400, "1 tadan 100 tagacha buyurtma tanlang");
  const updated = [];
  const failed = [];
  for (const id of ids) {
    try {
      if (!mongoose.isValidObjectId(id)) throw new Error("Noto'g'ri identifikator");
      const order = await Order.findById(id);
      if (!order) throw new Error("Buyurtma topilmadi");
      await transitionOrder(res, order, status, req.user);
      updated.push(String(id));
    } catch (err) {
      failed.push({ id: String(id), reason: err.message });
    }
  }
  res.status(200);
  res.json({ success: true, updated, failed });
});

const refundNote = async (order) => {
  if (order.isPaid && ["click", "payme", "sandbox"].includes(order.paymentProvider)) {
    await Order.updateOne(
      { _id: order._id },
      { $push: { statusHistory: { status: "tolov", note: `Diqqat: onlayn to'lov (${order.paymentProvider}) qaytarilishi kerak` } } }
    );
    return true;
  }
  return false;
};

// @desc    Buyurtmani bekor qilish (xodim) — sabab majburiy
// @route   PATCH /api/orders/:id/cancel
const cancelOrder = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri buyurtma identifikatori");
  const reason = String(req.body.reason || "").trim().slice(0, 200);
  if (reason.length < 3) fail(res, 400, "Bekor qilish sababini yozing (kamida 3 belgi)");

  const order = await cancelOrderCore({
    filter: { _id: req.params.id },
    cancelledBy: "staff",
    reason,
    userId: req.user._id,
  });
  if (!order) {
    const exists = await Order.exists({ _id: req.params.id });
    fail(res, exists ? 400 : 404, exists ? "Buyurtma allaqachon bekor qilingan" : "Buyurtma topilmadi");
  }
  const refundRequired = await refundNote(order);
  res.json({ success: true, data: order, refundRequired });
});

// @desc    Xaridor o'z buyurtmasini bekor qiladi (faqat "Yangi" holatida)
// @route   PATCH /api/orders/:id/customer-cancel
const customerCancelOrder = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri buyurtma identifikatori");
  const reason = String(req.body.reason || "").trim().slice(0, 200) || "Xaridor tomonidan bekor qilindi";

  const order = await cancelOrderCore({
    filter: { _id: req.params.id, user: req.user._id, status: "yangi" },
    cancelledBy: "customer",
    reason,
    userId: req.user._id,
  });
  if (!order) {
    const existing = await Order.findOne({ _id: req.params.id, user: req.user._id }).select("status");
    if (!existing) fail(res, 404, "Buyurtma topilmadi");
    if (existing.status === "bekor_qilindi") fail(res, 400, "Buyurtma allaqachon bekor qilingan");
    fail(res, 400, "Buyurtma tasdiqlangan, uni bekor qilish uchun do'kon bilan bog'laning");
  }
  const refundRequired = await refundNote(order);
  res.json({ success: true, data: order, refundRequired });
});

// @desc    To'lovni qo'lda belgilash (naqd olinganda). Onlayn to'langanlarni o'zgartirib bo'lmaydi.
//          body: { isPaid: boolean }
// @route   PATCH /api/orders/:id/payment
const setPayment = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri buyurtma identifikatori");
  const order = await Order.findById(req.params.id);
  if (!order) fail(res, 404, "Buyurtma topilmadi");
  if (order.status === "bekor_qilindi") fail(res, 400, "Bekor qilingan buyurtma uchun to'lov belgilab bo'lmaydi");
  if (["click", "payme", "sandbox"].includes(order.paymentProvider)) {
    fail(res, 400, "Onlayn to'langan buyurtmaning to'lov holatini qo'lda o'zgartirib bo'lmaydi");
  }
  const isPaid = req.body.isPaid === true;
  if (order.isPaid === isPaid) fail(res, 400, isPaid ? "Buyurtma allaqachon to'langan" : "Buyurtma to'lanmagan holatda");

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, isPaid: order.isPaid },
    {
      $set: {
        isPaid,
        paidAt: isPaid ? new Date() : null,
        paymentProvider: isPaid ? "manual" : "",
        ...(isPaid ? { paymentExpiresAt: null } : {}),
      },
      $push: {
        statusHistory: { status: "tolov", by: req.user._id, note: isPaid ? "To'lov qo'lda qabul qilindi" : "To'lov belgisi olib tashlandi" },
      },
    },
    { new: true }
  );
  if (!updated) fail(res, 409, "Buyurtma boshqa foydalanuvchi tomonidan o'zgartirildi. Sahifani yangilang");
  res.json({ success: true, data: updated });
});

// @desc    Xodimlarning ichki izohi (xaridor ko'rmaydi)
// @route   PATCH /api/orders/:id/staff-note
const setStaffNote = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri buyurtma identifikatori");
  const staffNote = String(req.body.staffNote || "").trim();
  if (staffNote.length > 500) fail(res, 400, "Izoh 500 belgidan oshmasligi kerak");
  const order = await Order.findByIdAndUpdate(req.params.id, { $set: { staffNote } }, { new: true });
  if (!order) fail(res, 404, "Buyurtma topilmadi");
  res.json({ success: true, data: order });
});

// @desc    Shoshilinch deb belgilash
// @route   PATCH /api/orders/:id/urgent
const setUrgent = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri buyurtma identifikatori");
  const order = await Order.findByIdAndUpdate(req.params.id, { $set: { isUrgent: req.body.isUrgent === true } }, { new: true });
  if (!order) fail(res, 404, "Buyurtma topilmadi");
  res.json({ success: true, data: order });
});

// @desc    Yetkazib berish ma'lumotini tahrirlash (manzil, telefon, vaqt) — yetkazilmagan buyurtmalar uchun
// @route   PATCH /api/orders/:id/delivery
const updateDelivery = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri buyurtma identifikatori");
  const order = await Order.findById(req.params.id);
  if (!order) fail(res, 404, "Buyurtma topilmadi");
  if (["yetkazilmoqda", "yetkazildi", "bekor_qilindi"].includes(order.status)) {
    fail(res, 400, "Bu holatdagi buyurtmaning yetkazib berish ma'lumotini o'zgartirib bo'lmaydi");
  }
  const settings = await getSettings();
  const addr = validateAddress(res, { ...order.deliveryAddress.toObject(), ...(req.body.deliveryAddress || {}) }, settings);
  const slot = req.body.deliverySlot === undefined ? order.deliverySlot.toObject() : validateSlot(res, req.body.deliverySlot);

  order.deliveryAddress = addr;
  order.deliverySlot = slot;
  order.statusHistory.push({ status: "tolov", by: req.user._id, note: "Yetkazib berish ma'lumoti xodim tomonidan o'zgartirildi" });
  await order.save();
  res.json({ success: true, data: order });
});

// @desc    Kuryerni biriktirish yoki olib tashlash   body: { courier: id | null }
// @route   PATCH /api/orders/:id/courier
const assignCourier = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri buyurtma identifikatori");
  const order = await Order.findById(req.params.id);
  if (!order) fail(res, 404, "Buyurtma topilmadi");
  if (["yetkazildi", "bekor_qilindi"].includes(order.status)) fail(res, 400, "Bu buyurtma uchun kuryer biriktirib bo'lmaydi");

  let courierId = null;
  if (req.body.courier) {
    if (!mongoose.isValidObjectId(req.body.courier)) fail(res, 400, "Kuryer identifikatori noto'g'ri");
    const c = await User.findOne({ _id: req.body.courier, role: "courier", isBlocked: false });
    if (!c) fail(res, 400, "Kuryer topilmadi yoki bloklangan");
    courierId = c._id;
  }
  order.courier = courierId;
  order.statusHistory.push({
    status: "tolov",
    by: req.user._id,
    note: courierId ? "Kuryer biriktirildi" : "Kuryer olib tashlandi",
  });
  await order.save();
  await order.populate("courier", "name phone");
  res.json({ success: true, data: order });
});

// @desc    Kuryerlar ro'yxati (biriktirish uchun)
// @route   GET /api/orders/couriers
const listCouriers = asyncHandler(async (req, res) => {
  const couriers = await User.find({ role: "courier", isBlocked: false }).select("name phone");
  res.json({ success: true, data: couriers });
});

module.exports = {
  createOrder,
  validateCart,
  getMyOrders,
  getOrders,
  getOrderById,
  updateOrderStatus,
  bulkUpdateStatus,
  cancelOrder,
  customerCancelOrder,
  setPayment,
  setStaffNote,
  setUrgent,
  updateDelivery,
  assignCourier,
  listCouriers,
};

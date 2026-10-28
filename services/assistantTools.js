// AI yordamchi uchun vositalar (tools). Admin "ish bersa" yordamchi shularni to'g'ridan-to'g'ri bajaradi.
// Qaytarib bo'lmaydigan amallar (bekor qilish, o'chirish, bloklash) faqat TAKLIF qilinadi va admin tugmani bosgandagina bajariladi.
const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Coupon = require("../models/Coupon");
const User = require("../models/User");
const Settings = require("../models/Settings");
const Announcement = require("../models/Announcement");
const Attendance = require("../models/Attendance");
const Debt = require("../models/Debt");
const { transitionOrder, cancelOrderCore } = require("./orderService");

const STAFF_ROLES = ["admin", "manager", "cashier", "warehouse", "courier"];
const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fakeRes = { status() { return this; } };

class ToolError extends Error {}
const bad = (msg) => {
  throw new ToolError(msg);
};
const num = (v, name, { min = 0, integer = false } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || (integer && !Number.isInteger(n))) bad(`"${name}" noto'g'ri qiymat`);
  return n;
};

// ---------- qidiruv yordamchilari ----------
const findProduct = async (q) => {
  if (!q) bad("Mahsulot nomi ko'rsatilmagan");
  if (mongoose.isValidObjectId(q)) {
    const p = await Product.findById(q);
    if (p) return p;
  }
  const exact = await Product.find({ name: new RegExp(`^${escapeRx(q)}$`, "i") }).limit(3);
  if (exact.length === 1) return exact[0];
  const list = exact.length ? exact : await Product.find({ name: new RegExp(escapeRx(q), "i") }).limit(6);
  if (list.length === 0) bad(`"${q}" nomli mahsulot topilmadi`);
  if (list.length > 1) bad(`"${q}" bo'yicha bir nechta mahsulot topildi: ${list.map((p) => p.name).join(", ")}. Aniqroq nom ayting`);
  return list[0];
};

const findOrder = async (num_) => {
  const n = String(num_ || "").trim().toUpperCase();
  if (!n) bad("Buyurtma raqami ko'rsatilmagan");
  const o = await Order.findOne({ orderNumber: n });
  if (!o) bad(`${n} raqamli buyurtma topilmadi`);
  return o;
};

const findStaff = async (name, roles = STAFF_ROLES) => {
  const rx = new RegExp(escapeRx(name || ""), "i");
  const list = await User.find({ role: { $in: roles }, $or: [{ name: rx }, { email: rx }] }).limit(5);
  if (list.length === 0) bad(`"${name}" nomli xodim topilmadi`);
  if (list.length > 1) bad(`"${name}" bo'yicha bir nechta xodim topildi: ${list.map((u) => u.name).join(", ")}`);
  return list[0];
};

const startOfDay = (d) => {
  const x = d ? new Date(d) : new Date();
  x.setHours(0, 0, 0, 0);
  return x;
};
const money = (n) => `${Number(n || 0).toLocaleString("ru-RU")} so'm`;

const orderBrief = (o) => ({
  orderNumber: o.orderNumber || String(o._id).slice(-6),
  status: o.status,
  total: o.totalAmount,
  paid: o.isPaid,
  method: o.paymentMethod,
  customer: o.user && o.user.name,
  phone: o.deliveryAddress && o.deliveryAddress.phone,
  createdAt: o.createdAt,
});

// ---------- vositalar ro'yxati ----------
const T = (name, description, properties = {}, required = []) => ({
  name,
  description,
  input_schema: { type: "object", properties, required },
});
const S = (description) => ({ type: "string", description });
const N = (description) => ({ type: "number", description });

const READ = {
  get_dashboard_summary: {
    def: T("get_dashboard_summary", "Bugungi/oylik tushum, buyurtmalar, xaridorlar va kam qolgan mahsulotlar soni."),
    run: async () => {
      const paid = { isPaid: true, status: { $ne: "bekor_qilindi" } };
      const day = startOfDay();
      const month = startOfDay();
      month.setDate(1);
      const sum = async (from) => {
        const r = await Order.aggregate([{ $match: { ...paid, createdAt: { $gte: from } } }, { $group: { _id: null, t: { $sum: "$totalAmount" } } }]);
        return r[0] ? r[0].t : 0;
      };
      const [today, thisMonth, ordersToday, newOrders, customers, low] = await Promise.all([
        sum(day),
        sum(month),
        Order.countDocuments({ createdAt: { $gte: day } }),
        Order.countDocuments({ status: "yangi" }),
        User.countDocuments({ role: "customer" }),
        Product.countDocuments({ $expr: { $lte: ["$stock", "$lowStockThreshold"] } }),
      ]);
      return { summary: "Statistika olindi", data: { todayRevenue: today, monthRevenue: thisMonth, ordersToday, newOrders, customers, lowStockProducts: low } };
    },
  },
  list_orders: {
    def: T(
      "list_orders",
      "Buyurtmalar ro'yxati (eng yangilari birinchi).",
      { status: S("yangi | tasdiqlandi | yigilmoqda | yetkazilmoqda | yetkazildi | bekor_qilindi"), search: S("buyurtma raqami yoki telefon"), limit: N("1-15, standart 8") }
    ),
    run: async ({ status, search, limit }) => {
      const q = {};
      if (status) q.status = status;
      if (search) {
        const rx = new RegExp(escapeRx(String(search).slice(0, 30)), "i");
        q.$or = [{ orderNumber: rx }, { "deliveryAddress.phone": rx }];
      }
      const list = await Order.find(q)
        .populate("user", "name")
        .sort({ createdAt: -1 })
        .limit(Math.min(Math.max(Number(limit) || 8, 1), 15));
      return { summary: `${list.length} ta buyurtma topildi`, data: list.map(orderBrief) };
    },
  },
  get_order: {
    def: T("get_order", "Bitta buyurtmaning to'liq ma'lumoti.", { orderNumber: S("masalan SE-000123") }, ["orderNumber"]),
    run: async ({ orderNumber }) => {
      const o = await (await findOrder(orderNumber)).populate("user courier", "name phone");
      return {
        summary: `${o.orderNumber} ma'lumoti olindi`,
        data: {
          ...orderBrief(o),
          items: o.items.map((i) => `${i.name} x${i.quantity} = ${i.price * i.quantity}`),
          address: o.deliveryAddress,
          slot: o.deliverySlot,
          note: o.note,
          staffNote: o.staffNote,
          courier: o.courier && o.courier.name,
          deliveryFee: o.deliveryFee,
          history: (o.statusHistory || []).map((h) => `${h.status}${h.note ? ` (${h.note})` : ""}`),
        },
      };
    },
  },
  list_products: {
    def: T("list_products", "Mahsulotlar ro'yxati.", { search: S("nom bo'yicha qidiruv"), lowStockOnly: { type: "boolean" }, limit: N("1-20, standart 10") }),
    run: async ({ search, lowStockOnly, limit }) => {
      const q = {};
      if (search) q.name = new RegExp(escapeRx(String(search).slice(0, 40)), "i");
      if (lowStockOnly) q.$expr = { $lte: ["$stock", "$lowStockThreshold"] };
      const list = await Product.find(q).populate("category", "name").limit(Math.min(Math.max(Number(limit) || 10, 1), 20));
      return {
        summary: `${list.length} ta mahsulot topildi`,
        data: list.map((p) => ({ name: p.name, price: p.price, stock: p.stock, unit: p.unit, category: p.category && p.category.name, active: p.isActive, sold: p.soldCount })),
      };
    },
  },
  list_categories: {
    def: T("list_categories", "Barcha kategoriyalar."),
    run: async () => {
      const list = await Category.find().select("name");
      return { summary: `${list.length} ta kategoriya`, data: list.map((c) => c.name) };
    },
  },
  list_staff: {
    def: T("list_staff", "Xodimlar ro'yxati (lavozim, oylik, holat)."),
    run: async () => {
      const list = await User.find({ role: { $in: STAFF_ROLES } }).select("name email role monthlySalary isBlocked");
      return { summary: `${list.length} ta xodim`, data: list.map((u) => ({ name: u.name, email: u.email, role: u.role, salary: u.monthlySalary, blocked: u.isBlocked })) };
    },
  },
  attendance_today: {
    def: T("attendance_today", "Bugungi davomat holati."),
    run: async () => {
      const day = startOfDay();
      const next = new Date(day.getTime() + 864e5);
      const staff = await User.find({ role: { $in: STAFF_ROLES }, isBlocked: false }).select("name");
      const rec = await Attendance.find({ date: { $gte: day, $lt: next } });
      const by = Object.fromEntries(rec.map((r) => [String(r.user), r.status]));
      return { summary: "Davomat olindi", data: staff.map((u) => ({ name: u.name, status: by[String(u._id)] || "belgilanmagan" })) };
    },
  },
  list_debts: {
    def: T("list_debts", "Qarz daftari.", { onlyOpen: { type: "boolean", description: "faqat yopilmagan qarzlar (standart true)" } }),
    run: async ({ onlyOpen = true }) => {
      const list = await Debt.find().sort({ createdAt: -1 }).limit(30);
      const rows = list.filter((d) => (onlyOpen ? !d.isClosed : true));
      return { summary: `${rows.length} ta qarz yozuvi`, data: rows.map((d) => ({ customer: d.customerName, phone: d.customerPhone, total: d.totalAmount, paid: d.paidAmount, remaining: d.remaining })) };
    },
  },
};

const SETTINGS_FIELDS = {
  deliveryFee: "number", freeDeliveryFrom: "number", minOrderAmount: "number",
  deliveryRegions: "array", storeName: "string", phone: "string", email: "string", address: "string",
  heroTitle: "string", heroSubtitle: "string", heroBadge: "string",
};

const WRITE = {
  create_category: {
    def: T("create_category", "Yangi kategoriya yaratish.", { name: S("kategoriya nomi") }, ["name"]),
    run: async ({ name }, ctx) => {
      const n = String(name || "").trim();
      if (n.length < 2) bad("Kategoriya nomi juda qisqa");
      if (await Category.findOne({ name: new RegExp(`^${escapeRx(n)}$`, "i") })) bad(`"${n}" kategoriyasi allaqachon bor`);
      const c = await Category.create({ name: n });
      return { summary: `Kategoriya yaratildi: ${c.name}`, data: { name: c.name } };
    },
  },
  create_product: {
    def: T(
      "create_product",
      "Yangi mahsulot qo'shish. Kategoriya mavjud bo'lishi kerak.",
      { name: S("mahsulot nomi"), categoryName: S("mavjud kategoriya nomi"), price: N("sotish narxi, so'm"), stock: N("qoldiq, standart 0"), unit: S("dona | kg | metr | quti | litr"), costPrice: N("tannarx"), description: S("tavsif"), imageUrl: S("rasm havolasi") },
      ["name", "categoryName", "price"]
    ),
    run: async (i) => {
      const cat = await Category.findOne({ name: new RegExp(`^${escapeRx(i.categoryName || "")}$`, "i") });
      if (!cat) bad(`"${i.categoryName}" kategoriyasi topilmadi. Avval kategoriya yarating`);
      const p = await Product.create({
        name: String(i.name).trim(),
        category: cat._id,
        price: num(i.price, "price", { min: 1 }),
        stock: i.stock === undefined ? 0 : num(i.stock, "stock", { integer: true }),
        costPrice: i.costPrice === undefined ? 0 : num(i.costPrice, "costPrice"),
        unit: ["dona", "kg", "metr", "quti", "litr"].includes(i.unit) ? i.unit : "dona",
        description: i.description || "",
        images: i.imageUrl ? [i.imageUrl] : [],
      });
      return { summary: `Mahsulot qo'shildi: ${p.name} (${money(p.price)})`, data: { name: p.name, price: p.price, stock: p.stock } };
    },
  },
  update_product: {
    def: T(
      "update_product",
      "Mahsulot narxi, qoldig'i, nomi yoki faolligini o'zgartirish.",
      { product: S("mahsulot nomi"), price: N("yangi narx"), setStock: N("qoldiqni shu songa o'rnatish"), addStock: N("qoldiqqa qo'shish (manfiy bo'lsa ayirish)"), isActive: { type: "boolean" }, newName: S("yangi nom") },
      ["product"]
    ),
    run: async (i) => {
      const p = await findProduct(i.product);
      const changes = [];
      if (i.price !== undefined) { p.price = num(i.price, "price", { min: 1 }); changes.push(`narx ${money(p.price)}`); }
      if (i.setStock !== undefined) { p.stock = num(i.setStock, "setStock", { integer: true }); changes.push(`qoldiq ${p.stock}`); }
      if (i.addStock !== undefined) {
        const add = num(i.addStock, "addStock", { min: -1e9, integer: true });
        if (p.stock + add < 0) bad(`Qoldiq manfiy bo'lib qoladi (hozir ${p.stock})`);
        p.stock += add; changes.push(`qoldiq ${p.stock}`);
      }
      if (i.isActive !== undefined) { p.isActive = Boolean(i.isActive); changes.push(p.isActive ? "faollashtirildi" : "sotuvdan olindi"); }
      if (i.newName) { p.name = String(i.newName).trim(); changes.push(`nom: ${p.name}`); }
      if (!changes.length) bad("O'zgartirish uchun hech narsa ko'rsatilmadi");
      await p.save();
      return { summary: `${p.name}: ${changes.join(", ")}`, data: { name: p.name, price: p.price, stock: p.stock, active: p.isActive } };
    },
  },
  advance_order: {
    def: T(
      "advance_order",
      "Buyurtma statusini keyingi bosqichga o'tkazish (faqat bir qadam oldinga).",
      { orderNumber: S("SE-000123"), status: S("tasdiqlandi | yigilmoqda | yetkazilmoqda | yetkazildi"), courierName: S("kuryer ismi (ixtiyoriy)") },
      ["orderNumber", "status"]
    ),
    run: async (i, ctx) => {
      const o = await findOrder(i.orderNumber);
      const courier = i.courierName ? await findStaff(i.courierName, ["courier"]) : null;
      let updated;
      try {
        updated = await transitionOrder(fakeRes, o, i.status, ctx.user, courier && courier._id);
      } catch (e) {
        bad(e.message);
      }
      return { summary: `${updated.orderNumber}: ${o.status} → ${updated.status}`, data: { orderNumber: updated.orderNumber, status: updated.status } };
    },
  },
  assign_courier: {
    def: T("assign_courier", "Buyurtmaga kuryer biriktirish.", { orderNumber: S("SE-000123"), courierName: S("kuryer ismi") }, ["orderNumber", "courierName"]),
    run: async (i) => {
      const o = await findOrder(i.orderNumber);
      if (["yetkazildi", "bekor_qilindi"].includes(o.status)) bad("Bu buyurtma uchun kuryer biriktirib bo'lmaydi");
      const c = await findStaff(i.courierName, ["courier"]);
      o.courier = c._id;
      o.statusHistory.push({ status: "tolov", note: "Kuryer biriktirildi (AI yordamchi)" });
      await o.save();
      return { summary: `${o.orderNumber} → kuryer ${c.name}`, data: {} };
    },
  },
  set_order_staff_note: {
    def: T("set_order_staff_note", "Buyurtmaga ichki izoh yozish (xaridor ko'rmaydi).", { orderNumber: S("SE-000123"), note: S("izoh matni") }, ["orderNumber", "note"]),
    run: async (i) => {
      const o = await findOrder(i.orderNumber);
      o.staffNote = String(i.note).trim().slice(0, 500);
      await o.save();
      return { summary: `${o.orderNumber} ga izoh yozildi`, data: {} };
    },
  },
  mark_attendance: {
    def: T("mark_attendance", "Xodim davomatini belgilash.", { staffName: S("xodim ismi"), status: S("keldi | sababli | kelmadi"), date: S("YYYY-MM-DD, standart bugun") }, ["staffName", "status"]),
    run: async (i, ctx) => {
      if (!["keldi", "sababli", "kelmadi"].includes(i.status)) bad("Status keldi, sababli yoki kelmadi bo'lishi kerak");
      const u = await findStaff(i.staffName);
      const day = startOfDay(i.date);
      if (Number.isNaN(day.getTime())) bad("Sana noto'g'ri");
      await Attendance.findOneAndUpdate({ user: u._id, date: day }, { user: u._id, date: day, status: i.status, markedBy: ctx.user._id }, { upsert: true, new: true, setDefaultsOnInsert: true });
      return { summary: `${u.name}: ${i.status} (${day.toISOString().slice(0, 10)})`, data: {} };
    },
  },
  publish_announcement: {
    def: T("publish_announcement", "Sayt tepasidagi reklama yo'lagini yangilash (eskisi o'chiriladi).", { text: S("reklama matni"), linkUrl: S("ixtiyoriy havola, masalan /katalog") }, ["text"]),
    run: async (i) => {
      const text = String(i.text || "").trim();
      if (text.length < 3) bad("Reklama matni juda qisqa");
      await Announcement.updateMany({}, { isActive: false });
      await Announcement.create({ text, linkUrl: i.linkUrl || "", isActive: true });
      return { summary: `Reklama yangilandi: "${text}"`, data: {} };
    },
  },
  create_coupon: {
    def: T(
      "create_coupon",
      "Promo-kod yaratish.",
      { code: S("kod, masalan YOZ20"), discountType: S("percent | amount"), discountValue: N("foiz yoki so'm"), minOrderAmount: N("minimal buyurtma"), maxUsage: N("ishlatish limiti"), expiresAt: S("YYYY-MM-DD") },
      ["code", "discountType", "discountValue"]
    ),
    run: async (i) => {
      const code = String(i.code || "").trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,20}$/.test(code)) bad("Kod 3-20 ta lotin harf/raqamdan iborat bo'lishi kerak");
      if (!["percent", "amount"].includes(i.discountType)) bad("discountType percent yoki amount bo'lishi kerak");
      const value = num(i.discountValue, "discountValue", { min: 1 });
      if (i.discountType === "percent" && value > 90) bad("Foiz 90 dan oshmasligi kerak");
      if (await Coupon.findOne({ code })) bad(`${code} kodi allaqachon mavjud`);
      const c = await Coupon.create({
        code, discountType: i.discountType, discountValue: value,
        minOrderAmount: i.minOrderAmount ? num(i.minOrderAmount, "minOrderAmount") : 0,
        maxUsage: i.maxUsage ? num(i.maxUsage, "maxUsage", { min: 1, integer: true }) : null,
        expiresAt: i.expiresAt ? new Date(i.expiresAt) : null,
      });
      return { summary: `Promo-kod yaratildi: ${c.code} (${c.discountType === "percent" ? `${value}%` : money(value)})`, data: {} };
    },
  },
  add_debt: {
    def: T("add_debt", "Qarz daftariga yangi qarz yozish.", { customerName: S("mijoz ismi"), customerPhone: S("telefon"), amount: N("qarz summasi"), note: S("izoh") }, ["customerName", "amount"]),
    run: async (i, ctx) => {
      const d = await Debt.create({ customerName: String(i.customerName).trim(), customerPhone: i.customerPhone || "", totalAmount: num(i.amount, "amount", { min: 1 }), note: i.note || "", createdBy: ctx.user._id });
      return { summary: `Qarz yozildi: ${d.customerName} — ${money(d.totalAmount)}`, data: {} };
    },
  },
  update_settings: {
    def: T(
      "update_settings",
      "Do'kon sozlamalarini o'zgartirish (yetkazib berish haqi, bepul yetkazish chegarasi, hududlar, aloqa ma'lumotlari, banner matni).",
      { deliveryFee: N(""), freeDeliveryFrom: N("0 = o'chiq"), minOrderAmount: N(""), deliveryRegions: { type: "array", items: { type: "string" } }, storeName: S(""), phone: S(""), email: S(""), address: S(""), heroTitle: S(""), heroSubtitle: S(""), heroBadge: S("") }
    ),
    run: async (i) => {
      const s = (await Settings.findOne()) || (await Settings.create({}));
      const changed = [];
      for (const [k, type] of Object.entries(SETTINGS_FIELDS)) {
        if (i[k] === undefined) continue;
        if (type === "number") s[k] = num(i[k], k);
        else if (type === "array") {
          if (!Array.isArray(i[k]) || i[k].some((x) => typeof x !== "string")) bad("deliveryRegions matnlar ro'yxati bo'lishi kerak");
          s[k] = i[k].map((x) => x.trim()).filter(Boolean);
        } else s[k] = String(i[k]).trim();
        changed.push(k);
      }
      if (!changed.length) bad("O'zgartirish uchun hech narsa ko'rsatilmadi");
      await s.save();
      return { summary: `Sozlamalar yangilandi: ${changed.join(", ")}`, data: {} };
    },
  },
};

// ---------- tasdiqlash talab qiladigan (qaytarib bo'lmaydigan) amallar ----------
const pendingStore = new Map(); // id -> { tool, input, userId, summary, expires }
const PENDING_TTL = 10 * 60 * 1000;

const PROPOSE = {
  cancel_order: {
    def: T("cancel_order", "Buyurtmani bekor qilishni TAKLIF qilish (admin tasdiqlagandan keyin bajariladi).", { orderNumber: S("SE-000123"), reason: S("bekor qilish sababi") }, ["orderNumber", "reason"]),
    prepare: async (i) => {
      const o = await findOrder(i.orderNumber);
      if (o.status === "bekor_qilindi") bad("Buyurtma allaqachon bekor qilingan");
      if (String(i.reason || "").trim().length < 3) bad("Bekor qilish sababi kerak");
      return `${o.orderNumber} buyurtmasini bekor qilish (sabab: ${String(i.reason).trim()})`;
    },
    execute: async (i, ctx) => {
      const o = await findOrder(i.orderNumber);
      const done = await cancelOrderCore({ filter: { _id: o._id }, cancelledBy: "staff", reason: String(i.reason).trim().slice(0, 200), userId: ctx.user._id });
      if (!done) bad("Buyurtma allaqachon bekor qilingan");
      return `${done.orderNumber} bekor qilindi${done.isPaid ? ". Onlayn to'lov bo'lsa, pulni qaytarishni unutmang" : ""}`;
    },
  },
  delete_product: {
    def: T("delete_product", "Mahsulotni o'chirishni TAKLIF qilish (admin tasdiqlaydi).", { product: S("mahsulot nomi") }, ["product"]),
    prepare: async (i) => `"${(await findProduct(i.product)).name}" mahsulotini butunlay o'chirish`,
    execute: async (i) => {
      const p = await findProduct(i.product);
      await p.deleteOne();
      return `"${p.name}" o'chirildi`;
    },
  },
  block_user: {
    def: T("block_user", "Foydalanuvchini bloklashni TAKLIF qilish (admin tasdiqlaydi).", { email: S("foydalanuvchi emaili") }, ["email"]),
    prepare: async (i, ctx) => {
      const u = await User.findOne({ email: String(i.email || "").toLowerCase().trim() });
      if (!u) bad("Bunday email bilan foydalanuvchi topilmadi");
      if (String(u._id) === String(ctx.user._id)) bad("O'zingizni bloklab bo'lmaydi");
      return `${u.name} (${u.email}) foydalanuvchisini bloklash`;
    },
    execute: async (i, ctx) => {
      const u = await User.findOne({ email: String(i.email || "").toLowerCase().trim() });
      if (!u) bad("Foydalanuvchi topilmadi");
      if (String(u._id) === String(ctx.user._id)) bad("O'zingizni bloklab bo'lmaydi");
      u.isBlocked = true;
      await u.save({ validateModifiedOnly: true });
      return `${u.name} bloklandi`;
    },
  },
};

const REGISTRY = { ...READ, ...WRITE };
const TOOL_DEFS = [...Object.values(READ), ...Object.values(WRITE), ...Object.values(PROPOSE)].map((t) => t.def);

const cleanupPending = () => {
  const now = Date.now();
  for (const [id, p] of pendingStore) if (p.expires < now) pendingStore.delete(id);
};

// Vositani bajaradi. Natija: { ok, summary, data?, pending? }
const runTool = async (name, input, ctx) => {
  try {
    if (REGISTRY[name]) {
      const r = await REGISTRY[name].run(input || {}, ctx);
      return { ok: true, write: Boolean(WRITE[name]), summary: r.summary, data: r.data };
    }
    if (PROPOSE[name]) {
      cleanupPending();
      const summary = await PROPOSE[name].prepare(input || {}, ctx);
      const id = crypto.randomBytes(12).toString("hex");
      pendingStore.set(id, { tool: name, input: input || {}, userId: String(ctx.user._id), summary, expires: Date.now() + PENDING_TTL });
      return { ok: true, pending: { id, tool: name, summary }, summary: `Tasdiqlash kutilmoqda: ${summary}`, data: { note: "Admin tasdiqlash tugmasini bosgandagina bajariladi" } };
    }
    return { ok: false, summary: `Noma'lum vosita: ${name}`, error: `Noma'lum vosita: ${name}` };
  } catch (err) {
    if (err instanceof ToolError || err.name === "ValidationError" || err.code === 11000) {
      return { ok: false, summary: err.message, error: err.message };
    }
    console.error(`AI vosita xatosi (${name}):`, err);
    return { ok: false, summary: "Ichki xato", error: "Ichki xato yuz berdi" };
  }
};

// Admin tasdiqlash tugmasini bosganda
const confirmPending = async (id, user) => {
  cleanupPending();
  const p = pendingStore.get(id);
  if (!p || p.userId !== String(user._id)) return { ok: false, summary: "Amal topilmadi yoki muddati tugagan" };
  pendingStore.delete(id); // bir marta ishlatiladi
  try {
    const summary = await PROPOSE[p.tool].execute(p.input, { user });
    return { ok: true, summary, tool: p.tool };
  } catch (err) {
    if (err instanceof ToolError) return { ok: false, summary: err.message, tool: p.tool };
    console.error("AI tasdiqlangan amal xatosi:", err);
    return { ok: false, summary: "Ichki xato yuz berdi", tool: p.tool };
  }
};

const rejectPending = (id, user) => {
  const p = pendingStore.get(id);
  if (p && p.userId === String(user._id)) pendingStore.delete(id);
  return { ok: true };
};

module.exports = { TOOL_DEFS, runTool, confirmPending, rejectPending, _pendingStore: pendingStore };

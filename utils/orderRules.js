// Buyurtma bo'yicha umumiy qoidalar va tekshiruvlar
const UZ_PHONE = /^\+?998\d{9}$/;
const SLOT_START = { "09:00-12:00": 9, "12:00-17:00": 12, "17:00-21:00": 17 };
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

const fail = (res, status, message) => {
  res.status(status);
  throw new Error(message);
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

// Manzil, hudud, telefon va koordinatalarni tekshiradi
const validateAddress = (res, addr, settings) => {
  const a = addr || {};
  const region = String(a.region || "").trim();
  const address = String(a.address || "").trim();
  const phone = String(a.phone || "").replace(/[\s()-]/g, "");

  if (!region) fail(res, 400, "Yetkazib berish hududini tanlang");
  const allowed = (settings.deliveryRegions || []).map((r) => r.toLowerCase());
  if (allowed.length && !allowed.includes(region.toLowerCase())) {
    fail(res, 400, `"${region}" hududiga yetkazib berilmaydi. Mavjud hududlar: ${settings.deliveryRegions.join(", ")}`);
  }
  if (address.length < 10) fail(res, 400, "To'liq manzilni kiriting (ko'cha, uy raqami)");
  if (!UZ_PHONE.test(phone)) fail(res, 400, "Telefon raqami noto'g'ri. Namuna: +998901234567");

  let lat = null;
  let lng = null;
  if (a.lat !== undefined && a.lat !== null && a.lat !== "") {
    lat = Number(a.lat);
    lng = Number(a.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      fail(res, 400, "Joylashuv koordinatalari noto'g'ri");
    }
  }
  return { region, address, phone, lat, lng };
};

module.exports = { UZ_PHONE, SLOT_START, TASHKENT_OFFSET_MS, fail, validateSlot, validateAddress };

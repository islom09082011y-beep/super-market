const { ONLINE_METHODS } = require("./orderService");

const isProd = () => process.env.NODE_ENV === "production";

// Test (sandbox) rejimi: production'da faqat PAYMENT_SANDBOX=true bilan qo'lda yoqiladi
const sandboxEnabled = () =>
  process.env.PAYMENT_SANDBOX ? process.env.PAYMENT_SANDBOX === "true" : !isProd();

const clickConfigured = () =>
  Boolean(process.env.CLICK_SERVICE_ID && process.env.CLICK_MERCHANT_ID && process.env.CLICK_SECRET_KEY);

const paymeKey = () =>
  process.env.PAYME_TEST === "true" ? process.env.PAYME_TEST_KEY || process.env.PAYME_KEY : process.env.PAYME_KEY;
const paymeConfigured = () => Boolean(process.env.PAYME_MERCHANT_ID && paymeKey());

// To'lov usuliga qarab qaysi provayder ishlatilishini aniqlaydi. Mavjud emas bo'lsa null.
const resolveProvider = (method) => {
  if (!ONLINE_METHODS.includes(method)) return null;
  if (method === "click") return clickConfigured() ? "click" : sandboxEnabled() ? "sandbox" : null;
  if (method === "payme") return paymeConfigured() ? "payme" : sandboxEnabled() ? "sandbox" : null;
  // "karta": mavjud provayderlardan birinchisi
  if (clickConfigured()) return "click";
  if (paymeConfigured()) return "payme";
  return sandboxEnabled() ? "sandbox" : null;
};

const returnUrl = (order) => `${process.env.CLIENT_URL || "http://localhost:5173"}/buyurtmalarim/${order._id}`;

// Xaridorni to'lov sahifasiga yo'naltiruvchi ma'lumot
const buildPaymentInfo = (order, provider) => {
  if (provider === "click") {
    const q = new URLSearchParams({
      service_id: process.env.CLICK_SERVICE_ID,
      merchant_id: process.env.CLICK_MERCHANT_ID,
      amount: Number(order.totalAmount).toFixed(2),
      transaction_param: String(order._id),
      return_url: returnUrl(order),
    });
    return { provider, sandbox: false, url: `https://my.click.uz/services/pay?${q.toString()}` };
  }
  if (provider === "payme") {
    const field = process.env.PAYME_ACCOUNT_FIELD || "order_id";
    const params = `m=${process.env.PAYME_MERCHANT_ID};ac.${field}=${order._id};a=${Math.round(order.totalAmount * 100)};c=${returnUrl(order)}`;
    const base = process.env.PAYME_CHECKOUT_URL || (process.env.PAYME_TEST === "true" ? "https://test.paycom.uz" : "https://checkout.paycom.uz");
    return { provider, sandbox: false, url: `${base}/${Buffer.from(params).toString("base64")}` };
  }
  // sandbox: o'z saytimizdagi test to'lov sahifasi
  return { provider: "sandbox", sandbox: true, url: `/tolov/${order._id}` };
};

const PAYMENT_WINDOW_MS = 60 * 60 * 1000; // onlayn to'lov uchun 60 daqiqa

module.exports = {
  sandboxEnabled,
  clickConfigured,
  paymeConfigured,
  paymeKey,
  resolveProvider,
  buildPaymentInfo,
  PAYMENT_WINDOW_MS,
};

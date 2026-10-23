// Yuz "imzolari" (128 o'lchamli vektor) bilan ishlash yordamchilari.
// Rasm saqlanmaydi, faqat raqamlar massivi.
const THRESHOLD = 0.5; // kichikroq = qat'iyroq (face-api standarti 0.6)

const isValidDescriptor = (d) =>
  Array.isArray(d) && d.length === 128 && d.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 5);

const distance = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
};

const average = (list) => {
  const out = new Array(128).fill(0);
  for (const d of list) for (let i = 0; i < 128; i++) out[i] += d[i] / list.length;
  return out;
};

// Xotirada urinishlarni cheklash: 10 daqiqada 5 tadan ortiq xato urinish bloklanadi
const failures = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;

const isLocked = (userId) => {
  const rec = failures.get(String(userId));
  if (!rec) return false;
  const recent = rec.filter((t) => Date.now() - t < WINDOW_MS);
  failures.set(String(userId), recent);
  return recent.length >= MAX_FAILS;
};
const registerFailure = (userId) => {
  const key = String(userId);
  failures.set(key, [...(failures.get(key) || []), Date.now()]);
};
const clearFailures = (userId) => failures.delete(String(userId));

module.exports = { THRESHOLD, isValidDescriptor, distance, average, isLocked, registerFailure, clearFailures };

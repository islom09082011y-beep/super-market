const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const User = require("../models/User");

const MAX_ADDRESSES = 5;
const UZ_PHONE = /^\+?998\d{9}$/;

const fail = (res, status, message) => {
  res.status(status);
  throw new Error(message);
};

const load = async (userId) => User.findById(userId).select("addresses");
const save = (user) => user.save({ validateModifiedOnly: true });

// @route GET /api/addresses
const listAddresses = asyncHandler(async (req, res) => {
  const user = await load(req.user._id);
  res.json({ success: true, data: user.addresses });
});

// @route POST /api/addresses   body: { label, region, address, phone, lat, lng, isDefault }
const createAddress = asyncHandler(async (req, res) => {
  const user = await load(req.user._id);
  if (user.addresses.length >= MAX_ADDRESSES) {
    fail(res, 400, `Eng ko'pi bilan ${MAX_ADDRESSES} ta manzil saqlash mumkin. Avval eskisini o'chiring`);
  }

  const region = String(req.body.region || "").trim();
  const address = String(req.body.address || "").trim();
  const phone = String(req.body.phone || "").replace(/[\s()-]/g, "");
  const label = String(req.body.label || "Uy").trim().slice(0, 30) || "Uy";

  if (!region) fail(res, 400, "Hududni kiriting");
  if (address.length < 10) fail(res, 400, "To'liq manzilni kiriting (ko'cha, uy raqami)");
  if (!UZ_PHONE.test(phone)) fail(res, 400, "Telefon raqami noto'g'ri. Namuna: +998901234567");

  let lat = null;
  let lng = null;
  if (req.body.lat !== undefined && req.body.lat !== null && req.body.lat !== "") {
    lat = Number(req.body.lat);
    lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      fail(res, 400, "Joylashuv koordinatalari noto'g'ri");
    }
  }

  // Bir xil manzil ikki marta saqlanmasin
  const dup = user.addresses.find(
    (a) => a.address.toLowerCase() === address.toLowerCase() && a.region.toLowerCase() === region.toLowerCase()
  );
  if (dup) fail(res, 400, "Bu manzil allaqachon saqlangan");

  const makeDefault = req.body.isDefault === true || user.addresses.length === 0;
  if (makeDefault) user.addresses.forEach((a) => (a.isDefault = false));
  user.addresses.push({ label, region, address, phone, lat, lng, isDefault: makeDefault });

  await save(user);
  res.status(201).json({ success: true, data: user.addresses });
});

// @route PATCH /api/addresses/:id/default
const setDefaultAddress = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri identifikator");
  const user = await load(req.user._id);
  const target = user.addresses.id(req.params.id);
  if (!target) fail(res, 404, "Manzil topilmadi");
  user.addresses.forEach((a) => (a.isDefault = a._id.equals(target._id)));
  await save(user);
  res.json({ success: true, data: user.addresses });
});

// @route DELETE /api/addresses/:id
const deleteAddress = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail(res, 400, "Noto'g'ri identifikator");
  const user = await load(req.user._id);
  const target = user.addresses.id(req.params.id);
  if (!target) fail(res, 404, "Manzil topilmadi");
  const wasDefault = target.isDefault;
  target.deleteOne();
  if (wasDefault && user.addresses.length > 0) user.addresses[0].isDefault = true;
  await save(user);
  res.json({ success: true, data: user.addresses });
});

module.exports = { listAddresses, createAddress, setDefaultAddress, deleteAddress };

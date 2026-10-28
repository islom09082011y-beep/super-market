const asyncHandler = require("express-async-handler");
const Settings = require("../models/Settings");

const getOrCreate = async () => {
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  return settings;
};

// @desc    Do'kon sozlamalarini olish (ochiq — bosh sahifa shundan foydalanadi)
// @route   GET /api/settings
// @access  Public
const getSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreate();
  res.json({ success: true, data: settings });
});

// @desc    Do'kon sozlamalarini yangilash
// @route   PUT /api/settings
// @access  Private/Admin
const updateSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreate();
  const fields = [
    "storeName",
    "phone",
    "email",
    "address",
    "heroBadge",
    "heroTitle",
    "heroSubtitle",
    "heroImageUrl",
    "logoUrl",
    "deliveryRegions",
    "minOrderAmount",
    "pickupAddress",
    "deliveryFee",
    "freeDeliveryFrom",
  ];
  for (const key of fields) {
    if (req.body[key] !== undefined) settings[key] = req.body[key];
  }
  await settings.save();
  res.json({ success: true, data: settings });
});

module.exports = { getSettings, updateSettings };

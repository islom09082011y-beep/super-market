const asyncHandler = require("express-async-handler");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// @desc    Oddiy ro'yxatdan o'tish (email + parol)
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Ism, email va parol kiritilishi shart");
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("Bu email bilan foydalanuvchi allaqachon mavjud");
  }

  const user = await User.create({ name, email, password, phone });

  res.status(201).json({
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role,
    },
    token: generateToken(user._id),
  });
});

// @desc    Oddiy login (email + parol)
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");

  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error("Email yoki parol noto'g'ri");
  }

  if (user.isBlocked) {
    res.status(403);
    throw new Error("Sizning hisobingiz bloklangan");
  }

  res.json({
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role,
    },
    token: generateToken(user._id),
  });
});

// @desc    Google orqali kirish / ro'yxatdan o'tish
//          Frontend Google Sign-In orqali olingan "idToken" shu yerga yuboriladi
// @route   POST /api/auth/google
// @access  Public
const googleAuth = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    res.status(400);
    throw new Error("Google idToken kiritilishi shart");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (error) {
    res.status(401);
    throw new Error("Google token tasdiqlanmadi");
  }

  const { sub: googleId, email, name, picture } = payload;

  if (!email) {
    res.status(400);
    throw new Error("Google hisobingizda email topilmadi");
  }

  // Avval googleId bo'yicha, keyin email bo'yicha qidiramiz
  let user = await User.findOne({ $or: [{ googleId }, { email }] });

  if (user) {
    // Agar oldin oddiy ro'yxatdan o'tgan bo'lsa, googleId ni biriktiramiz
    if (!user.googleId) {
      user.googleId = googleId;
      if (!user.avatar) user.avatar = picture || "";
      await user.save();
    }
  } else {
    user = await User.create({
      name: name || email.split("@")[0],
      email,
      googleId,
      avatar: picture || "",
    });
  }

  if (user.isBlocked) {
    res.status(403);
    throw new Error("Sizning hisobingiz bloklangan");
  }

  res.json({
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role,
    },
    token: generateToken(user._id),
  });
});

// @desc    Joriy foydalanuvchi ma'lumotlarini olish
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
});

// @desc    Profilni yangilash (ism, telefon, rasm)
// @route   PATCH /api/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, avatar } = req.body;
  const update = {};
  if (name !== undefined) {
    const n = String(name).trim();
    if (n.length < 2 || n.length > 60) {
      res.status(400);
      throw new Error("Ism 2 dan 60 gacha belgi bo'lishi kerak");
    }
    update.name = n;
  }
  if (phone !== undefined) {
    const ph = String(phone).replace(/[\s()-]/g, "");
    if (ph && !/^\+?998\d{9}$/.test(ph)) {
      res.status(400);
      throw new Error("Telefon raqami noto'g'ri. Namuna: +998901234567");
    }
    update.phone = ph;
  }
  if (avatar !== undefined) {
    const url = String(avatar).trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      res.status(400);
      throw new Error("Rasm manzili http:// yoki https:// bilan boshlanishi kerak");
    }
    update.avatar = url;
  }
  const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true, runValidators: true }).select("-password");
  res.json({ success: true, user });
});

// @desc    Parolni o'zgartirish
//          Google orqali kirgan va paroli yo'q foydalanuvchi joriy parolsiz yangisini o'rnatishi mumkin
// @route   POST /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);

  if (user.password) {
    if (!currentPassword || !(await user.matchPassword(currentPassword))) {
      res.status(400);
      throw new Error("Joriy parol noto'g'ri");
    }
  }
  const pw = String(newPassword || "");
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    res.status(400);
    throw new Error("Yangi parol kamida 8 belgidan iborat bo'lib, harf va raqam qatnashishi kerak");
  }
  if (currentPassword && pw === currentPassword) {
    res.status(400);
    throw new Error("Yangi parol joriy paroldan farq qilishi kerak");
  }
  user.password = pw; // pre-save hook xeshlaydi
  await user.save();
  res.json({ success: true, message: "Parol muvaffaqiyatli o'zgartirildi" });
});

module.exports = { registerUser, loginUser, googleAuth, getMe, updateProfile, changePassword };

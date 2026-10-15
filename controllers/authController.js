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

module.exports = { registerUser, loginUser, googleAuth, getMe };

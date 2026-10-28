const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");

// Foydalanuvchi tizimga kirganligini tekshirish (JWT token orqali)
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user) {
        res.status(401);
        throw new Error("Foydalanuvchi topilmadi, token yaroqsiz");
      }

      if (req.user.isBlocked) {
        res.status(403);
        throw new Error("Sizning hisobingiz bloklangan");
      }

      next();
    } catch (error) {
      res.status(401);
      throw new Error("Avtorizatsiyadan o'tilmagan, token yaroqsiz");
    }
  } else {
    res.status(401);
    throw new Error("Avtorizatsiyadan o'tilmagan, token topilmadi");
  }
});

// Faqat ko'rsatilgan rollarga ruxsat berish, masalan: authorize("admin", "manager")
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403);
      throw new Error(
        `"${req.user ? req.user.role : "mehmon"}" roli uchun ruxsat berilmagan`
      );
    }
    next();
  };
};

module.exports = { protect, authorize };

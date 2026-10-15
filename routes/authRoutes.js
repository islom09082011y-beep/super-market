const express = require("express");
const router = express.Router();
const { registerUser, loginUser, googleAuth, getMe } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/google", googleAuth); // Google bilan kirish/ro'yxatdan o'tish
router.get("/me", protect, getMe);

module.exports = router;

const express = require("express");
const router = express.Router();
<<<<<<< HEAD
const { registerUser, loginUser, googleAuth, getMe, updateProfile, changePassword } = require("../controllers/authController");
=======
<<<<<<< HEAD
const { registerUser, loginUser, googleAuth, getMe, updateProfile, changePassword } = require("../controllers/authController");
=======
const { registerUser, loginUser, googleAuth, getMe } = require("../controllers/authController");
>>>>>>> bc9ae5889c64d5cf0633056236dfd6089059bec4
>>>>>>> 2f79ba3b949036a4de3f3984e476c8f33106449d
const { protect } = require("../middleware/authMiddleware");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/google", googleAuth); // Google bilan kirish/ro'yxatdan o'tish
router.get("/me", protect, getMe);
<<<<<<< HEAD
router.patch("/profile", protect, updateProfile);
router.post("/change-password", protect, changePassword);
=======
<<<<<<< HEAD
router.patch("/profile", protect, updateProfile);
router.post("/change-password", protect, changePassword);
=======
>>>>>>> bc9ae5889c64d5cf0633056236dfd6089059bec4
>>>>>>> 2f79ba3b949036a4de3f3984e476c8f33106449d

module.exports = router;

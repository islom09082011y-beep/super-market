const express = require("express");
const router = express.Router();
const { 
    registerUser, 
    loginUser, 
    googleAuth, 
    getMe, 
    updateProfile, 
    changePassword 
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/google", googleAuth);
router.get("/me", protect, getMe);
router.patch("/profile", protect, updateProfile);
router.post("/change-password", protect, changePassword);

module.exports = router;
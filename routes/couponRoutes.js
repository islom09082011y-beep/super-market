const express = require("express");
const router = express.Router();
const {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  applyCoupon,
} = require("../controllers/couponController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.post("/apply", protect, applyCoupon); // xaridor checkoutda ishlatadi

router.get("/", protect, authorize("admin", "manager"), getCoupons);
router.post("/", protect, authorize("admin", "manager"), createCoupon);
router.put("/:id", protect, authorize("admin", "manager"), updateCoupon);
router.delete("/:id", protect, authorize("admin"), deleteCoupon);

module.exports = router;

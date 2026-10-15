const express = require("express");
const router = express.Router();
const {
  createOrder,
  validateCart,
  getMyOrders,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  customerCancelOrder,
} = require("../controllers/orderController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.post("/", protect, authorize("customer"), createOrder); // xaridor buyurtma beradi
router.post("/validate-cart", protect, authorize("customer"), validateCart);
router.get("/my", protect, getMyOrders); // xaridor o'z tarixini ko'radi

router.get("/", protect, authorize("admin", "manager", "cashier", "courier"), getOrders);
router.get("/:id", protect, getOrderById);
router.patch("/:id/status", protect, authorize("admin", "manager", "courier"), updateOrderStatus);
router.patch("/:id/customer-cancel", protect, authorize("customer"), customerCancelOrder);
router.patch("/:id/cancel", protect, authorize("admin", "manager"), cancelOrder);

module.exports = router;

const express = require("express");
const router = express.Router();
<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> 2f79ba3b949036a4de3f3984e476c8f33106449d
const c = require("../controllers/orderController");
const { protect, authorize } = require("../middleware/authMiddleware");

const STAFF = ["admin", "manager", "cashier", "courier"];
const OFFICE = ["admin", "manager", "cashier"];
const MANAGERS = ["admin", "manager"];

// Xaridor
router.post("/", protect, authorize("customer"), c.createOrder);
router.post("/validate-cart", protect, authorize("customer"), c.validateCart);
router.get("/my", protect, c.getMyOrders);

// Xodimlar
router.get("/", protect, authorize(...STAFF), c.getOrders);
router.get("/couriers", protect, authorize(...OFFICE), c.listCouriers);
router.post("/bulk-status", protect, authorize(...MANAGERS), c.bulkUpdateStatus);

router.get("/:id", protect, c.getOrderById);
router.patch("/:id/status", protect, authorize("admin", "manager", "courier"), c.updateOrderStatus);
router.patch("/:id/customer-cancel", protect, authorize("customer"), c.customerCancelOrder);
router.patch("/:id/cancel", protect, authorize(...MANAGERS), c.cancelOrder);
router.patch("/:id/payment", protect, authorize(...OFFICE), c.setPayment);
router.patch("/:id/staff-note", protect, authorize(...OFFICE), c.setStaffNote);
router.patch("/:id/urgent", protect, authorize(...MANAGERS), c.setUrgent);
router.patch("/:id/delivery", protect, authorize(...MANAGERS), c.updateDelivery);
router.patch("/:id/courier", protect, authorize(...MANAGERS), c.assignCourier);
<<<<<<< HEAD
=======
=======
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
>>>>>>> bc9ae5889c64d5cf0633056236dfd6089059bec4
>>>>>>> 2f79ba3b949036a4de3f3984e476c8f33106449d

module.exports = router;

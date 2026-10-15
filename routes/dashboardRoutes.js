const express = require("express");
const router = express.Router();
const { getSummary, getTopProducts, getDeadStock, getSalesSeries, getCategoryBreakdown } = require("../controllers/dashboardController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/summary", protect, authorize("admin"), getSummary);
router.get("/top-products", protect, authorize("admin", "manager"), getTopProducts);
router.get("/dead-stock", protect, authorize("admin", "manager"), getDeadStock);
router.get("/sales-series", protect, authorize("admin"), getSalesSeries);
router.get("/category-breakdown", protect, authorize("admin"), getCategoryBreakdown);

module.exports = router;

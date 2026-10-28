const express = require("express");
const router = express.Router();
const { getDebts, createDebt, addPayment, deleteDebt } = require("../controllers/debtController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/", protect, authorize("admin", "manager", "cashier"), getDebts);
router.post("/", protect, authorize("admin", "manager", "cashier"), createDebt);
router.post("/:id/payments", protect, authorize("admin", "manager", "cashier"), addPayment);
router.delete("/:id", protect, authorize("admin"), deleteDebt);

module.exports = router;

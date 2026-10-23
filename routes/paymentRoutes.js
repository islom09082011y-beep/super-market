const express = require("express");
const router = express.Router();
const { startPayment, clickPrepare, clickComplete, paymeEndpoint, sandboxPay, paymentStatus } = require("../controllers/paymentController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Provayderlar chaqiradigan manzillar (autentifikatsiyasiz, lekin imzo/parol bilan himoyalangan)
router.post("/click/prepare", clickPrepare);
router.post("/click/complete", clickComplete);
router.post("/payme", paymeEndpoint);

// Xaridor uchun
router.post("/sandbox/pay", protect, authorize("customer"), sandboxPay);
router.get("/order/:id", protect, authorize("customer"), paymentStatus);
router.post("/order/:id/start", protect, authorize("customer"), startPayment);

module.exports = router;

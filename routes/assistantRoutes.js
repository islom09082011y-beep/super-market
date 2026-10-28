const express = require("express");
const router = express.Router();
const { chat, confirm, reject } = require("../controllers/assistantController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));
router.post("/chat", chat);
router.post("/confirm", confirm);
router.post("/reject", reject);

module.exports = router;

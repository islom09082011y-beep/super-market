const express = require("express");
const router = express.Router();
const { getDailyAttendance, markAttendance, getMonthlySummary } = require("../controllers/attendanceController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/", protect, authorize("admin", "manager"), getDailyAttendance);
router.post("/", protect, authorize("admin", "manager"), markAttendance);
router.get("/summary", protect, authorize("admin"), getMonthlySummary);

module.exports = router;

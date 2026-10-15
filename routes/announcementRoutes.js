const express = require("express");
const router = express.Router();
const {
  getActiveAnnouncement,
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} = require("../controllers/announcementController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/active", getActiveAnnouncement); // ochiq, hamma ko'ra oladi
router.get("/", protect, authorize("admin"), getAnnouncements);
router.post("/", protect, authorize("admin"), createAnnouncement);
router.patch("/:id", protect, authorize("admin"), updateAnnouncement);
router.delete("/:id", protect, authorize("admin"), deleteAnnouncement);

module.exports = router;

const express = require("express");
const router = express.Router();
const { getUsers, getUserById, createStaffUser, updateUserRole, updateSalary, toggleBlockUser } = require("../controllers/userController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/", protect, authorize("admin"), getUsers);
router.post("/", protect, authorize("admin"), createStaffUser);
router.get("/:id", protect, authorize("admin"), getUserById);
router.patch("/:id/role", protect, authorize("admin"), updateUserRole);
router.patch("/:id/salary", protect, authorize("admin"), updateSalary);
router.patch("/:id/block", protect, authorize("admin"), toggleBlockUser);

module.exports = router;

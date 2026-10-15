const express = require("express");
const router = express.Router();
const { listAddresses, createAddress, setDefaultAddress, deleteAddress } = require("../controllers/addressController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("customer"));
router.get("/", listAddresses);
router.post("/", createAddress);
router.patch("/:id/default", setDefaultAddress);
router.delete("/:id", deleteAddress);

module.exports = router;

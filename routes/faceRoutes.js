const express = require("express");
const router = express.Router();
const { faceStatus, enrollFace, removeFace, setFaceRequired } = require("../controllers/faceController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("customer"));
router.get("/status", faceStatus);
router.post("/enroll", enrollFace);
router.delete("/", removeFace);
router.patch("/required", setFaceRequired);

module.exports = router;

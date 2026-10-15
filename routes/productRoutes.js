const express = require("express");
const router = express.Router();
const {
  getProducts,
  getProductById,
  getProductByBarcode,
  getLowStockProducts,
  getExpiringProducts,
  createProduct,
  updateProduct,
  adjustStock,
  deleteProduct,
} = require("../controllers/productController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Aniq (static) yo'llar :id dan OLDIN yozilishi kerak
router.get("/low-stock", protect, authorize("admin", "manager", "warehouse"), getLowStockProducts);
router.get("/expiring", protect, authorize("admin", "manager", "warehouse"), getExpiringProducts);
router.get("/barcode/:code", protect, authorize("admin", "manager", "cashier"), getProductByBarcode);

router.get("/", getProducts);
router.get("/:id", getProductById);

router.post("/", protect, authorize("admin", "manager", "warehouse"), createProduct);
router.put("/:id", protect, authorize("admin", "manager", "warehouse"), updateProduct);
router.patch("/:id/stock", protect, authorize("admin", "manager", "warehouse"), adjustStock);
router.delete("/:id", protect, authorize("admin"), deleteProduct);

module.exports = router;

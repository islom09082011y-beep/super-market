const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Mahsulot nomi kiritilishi shart"],
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    price: {
      type: Number,
      required: [true, "Narx kiritilishi shart"],
      min: 0,
    },
    costPrice: {
      // tannarx - direktor uchun foyda hisobida ishlatiladi
      type: Number,
      default: 0,
    },
    images: {
      type: [String],
      default: [],
    },
    barcode: {
      type: String,
      default: "",
      index: true,
    },
    unit: {
      type: String,
      enum: ["dona", "kg", "metr", "quti", "litr"],
      default: "dona",
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    rating: {
      type: Number,
      default: 0,
    },
    soldCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

productSchema.index({ name: "text", description: "text" });

module.exports = mongoose.model("Product", productSchema);

const mongoose = require("mongoose");

// Ketma-ket raqamlar uchun hisoblagich (masalan, buyurtma raqami SE-000001)
const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("Counter", counterSchema);

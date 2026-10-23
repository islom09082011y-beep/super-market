const mongoose = require("mongoose");

// AI yordamchi nima qilgani haqida audit yozuvi
const aiLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    prompt: { type: String, default: "" },
    actions: [{ tool: String, summary: String, ok: Boolean, _id: false }],
    pending: [{ tool: String, summary: String, confirmed: Boolean, _id: false }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("AiLog", aiLogSchema);

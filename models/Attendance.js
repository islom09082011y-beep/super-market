const mongoose = require("mongoose");

// Xodimlar davomati — har bir xodim uchun har kuni bitta yozuv.
// "date" har doim kunning boshiga (00:00) tekislanadi, shu sababli
// bir xodim uchun bir kunda faqat bitta yozuv bo'ladi (unique index).
const attendanceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["keldi", "kelmadi", "sababli"], // sababli = uzrli sabab bilan kelmadi, maoshdan ushlanmaydi
      required: true,
    },
    note: {
      type: String,
      default: "",
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);

const mongoose = require("mongoose");

// Sayt tepasidagi reklama/e'lon paneli — admin tomonidan boshqariladi.
// Bir vaqtning o'zida bir nechta yozuv saqlanishi mumkin, lekin faqat
// isActive=true bo'lgani xaridorlarga ko'rsatiladi (eng oxirgisi).
const announcementSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, "Reklama matni kiritilishi shart"],
      trim: true,
    },
    linkUrl: {
      type: String,
      default: "",
      trim: true,
    },
    linkLabel: {
      type: String,
      default: "Ko'rish",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Announcement", announcementSchema);

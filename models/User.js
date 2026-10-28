const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Saqlangan yetkazib berish manzillari (maksimum 5 ta)
const addressSchema = new mongoose.Schema({
  label: { type: String, default: "Uy", trim: true, maxlength: 30 },
  region: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Ism kiritilishi shart"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email kiritilishi shart"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      // Google orqali ro'yxatdan o'tganlarda parol bo'lmasligi mumkin
      required: function () {
        return !this.googleId;
      },
      minlength: 6,
      select: false,
    },
    googleId: {
      type: String,
      default: null,
    },
    avatar: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      default: "",
    },
    // Tizimdagi rol: xaridor va xodimlar (admin panel huquqlari)
    role: {
      type: String,
      enum: ["customer", "admin", "manager", "cashier", "warehouse", "courier"],
      default: "customer",
    },
    addresses: { type: [addressSchema], default: [] },
<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> 2f79ba3b949036a4de3f3984e476c8f33106449d
    // Yuz orqali tasdiqlash: faqat 128 o'lchamli "imzo" saqlanadi, rasm saqlanmaydi
    faceDescriptor: { type: [Number], default: undefined, select: false },
    faceEnrolledAt: { type: Date, default: null },
    faceRequiredForOrders: { type: Boolean, default: false },
<<<<<<< HEAD
=======
=======
>>>>>>> bc9ae5889c64d5cf0633056236dfd6089059bec4
>>>>>>> 2f79ba3b949036a4de3f3984e476c8f33106449d
    isBlocked: {
      type: Boolean,
      default: false,
    },
    // Xodim uchun belgilangan oylik maosh (so'mda). Davomat asosida
    // kelmagan kunlar uchun shu summadan ushlab qolinadi.
    monthlySalary: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Parolni saqlashdan oldin shifrlash
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);

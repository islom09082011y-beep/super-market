/**
 * Standart admin hisobini yaratish uchun bir martalik skript.
 * Ishga tushirish: node seed.js
 *
 * Login ma'lumotlarini o'zgartirmoqchi bo'lsangiz, quyidagi
 * ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME qiymatlarini
 * o'zgartiring yoki .env fayliga shu nomlar bilan qo'shing.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const User = require("./models/User");

const ADMIN_NAME = process.env.ADMIN_NAME || "Direktor";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@shopease.uz";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";

const run = async () => {
  await connectDB();

  const existing = await User.findOne({ email: ADMIN_EMAIL });

  if (existing) {
    if (existing.role !== "admin") {
      existing.role = "admin";
      await existing.save();
      console.log(`Mavjud "${ADMIN_EMAIL}" hisobi admin roliga o'tkazildi.`);
    } else {
      console.log(`"${ADMIN_EMAIL}" hisobi allaqachon mavjud va admin roliga ega. Hech narsa o'zgartirilmadi.`);
    }
  } else {
    await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "admin",
    });
    console.log("Admin hisobi yaratildi:");
    console.log(`  Email : ${ADMIN_EMAIL}`);
    console.log(`  Parol : ${ADMIN_PASSWORD}`);
    console.log("\nDiqqat: birinchi kirishdan so'ng parolni o'zgartirishni unutmang.");
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Seed xatosi:", err.message);
  process.exit(1);
});

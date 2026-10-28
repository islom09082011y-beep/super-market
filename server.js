const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

dotenv.config();
console.log("MONGO_URI:", process.env.MONGO_URI);
connectDB();

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// Routelar
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/coupons", require("./routes/couponRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/announcements", require("./routes/announcementRoutes"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/debts", require("./routes/debtRoutes"));
app.use("/api/addresses", require("./routes/addresses"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/face", require("./routes/faceRoutes"));
app.use("/api/assistant", require("./routes/assistant"));
app.get("/", (req, res) => {
  res.json({ success: true, message: "Internet-do'kon backend API ishlamoqda" });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    require("./jobs/paymentExpiry").start(); // to'lanmagan onlayn buyurtma
    console.log(`Server ${PORT}-portda ishga tushdi`);
});

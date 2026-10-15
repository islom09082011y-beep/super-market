const asyncHandler = require("express-async-handler");
const Debt = require("../models/Debt");

const getDebts = asyncHandler(async (req, res) => {
  const debts = await Debt.find().sort({ createdAt: -1 });
  res.json({ success: true, data: debts });
});

const createDebt = asyncHandler(async (req, res) => {
  const { customerName, customerPhone, totalAmount, note } = req.body;
  if (!customerName || !totalAmount) {
    res.status(400);
    throw new Error("Mijoz ismi va qarz summasi kiritilishi shart");
  }
  const debt = await Debt.create({
    customerName,
    customerPhone,
    totalAmount: Number(totalAmount),
    note,
    createdBy: req.user._id,
  });
  res.status(201).json({ success: true, data: debt });
});

const addPayment = asyncHandler(async (req, res) => {
  const debt = await Debt.findById(req.params.id);
  if (!debt) {
    res.status(404);
    throw new Error("Qarz yozuvi topilmadi");
  }
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) {
    res.status(400);
    throw new Error("To'lov summasi noto'g'ri");
  }
  if (amount > debt.totalAmount - debt.paidAmount) {
    res.status(400);
    throw new Error("To'lov summasi qolgan qarzdan oshib ketdi");
  }
  debt.payments.push({ amount, note: req.body.note || "" });
  debt.paidAmount += amount;
  await debt.save();
  res.json({ success: true, data: debt });
});

const deleteDebt = asyncHandler(async (req, res) => {
  const debt = await Debt.findById(req.params.id);
  if (!debt) {
    res.status(404);
    throw new Error("Qarz yozuvi topilmadi");
  }
  await debt.deleteOne();
  res.json({ success: true, data: {} });
});

module.exports = { getDebts, createDebt, addPayment, deleteDebt };

const notFound = (req, res, next) => {
  const error = new Error(`Manzil topilmadi: ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;

  // Mongoose noto'g'ri ObjectId xatosi
  if (err.name === "CastError" && err.kind === "ObjectId") {
    statusCode = 404;
    message = "Resurs topilmadi";
  }

  // Mongoose validation xatosi
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
  }

  // Takrorlanuvchi (unique) qiymat xatosi
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue)[0];
    message = `Bu ${field} allaqachon mavjud`;
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
};

module.exports = { notFound, errorHandler };

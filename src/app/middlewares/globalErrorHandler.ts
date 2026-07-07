import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { JsonWebTokenError } from "jsonwebtoken";
import zodErrorHandler from "../../errors/zodErrorHandler";

import AppError from "../../errors/AppError";
import config from "../../config";
import { Prisma } from "@prisma/client";
import logger from "../../utils/logger";

export const globalErrorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  _next,
) => {
  let message = err.message || "Something went wrong!";
  let statusCode = err.statusCode || 500;
  let error = err || null;
  let stack = err.stack || null;

  if (err instanceof ZodError) {
    const result = zodErrorHandler(err);
    statusCode = result.statusCode;
    message = result.message;
    error = result.error;
  } else if (err instanceof JsonWebTokenError) {
    statusCode = 401;
    message = "Unauthorized Access";
    error = null;
    stack = err.stack;
  } else if (err instanceof Prisma.PrismaClientInitializationError) {
    message = err.message;
    stack = err.stack;
    error = null;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    message = err.message;
    stack = err.stack;
    error = null;
  } else if (err instanceof Prisma.PrismaClientRustPanicError) {
    message = err.message;
    stack = err.stack;
    error = null;
  } else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    message = err.message;
    stack = err.stack;
    error = null;
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    message = err.message;
    stack = err.stack;
    error = err;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    error = null;
  } else if (err instanceof Error) {
    if (err.message) {
      message = err.message;
    } else {
      message =
        statusCode === 400
          ? "Bad Request"
          : statusCode === 404
            ? "Not Found"
            : statusCode === 401
              ? "Unauthorized Access"
              : statusCode === 403
                ? "Forbidden Access"
                : statusCode === 500
                  ? "Server Error"
                  : "Something went wrong";
    }
  }

  logger.error(`${statusCode} - ${message}`, {
    stack,
    requestId: req.headers["x-request-id"],
  });

  res.status(statusCode).json({
    success: false,
    message: message,
    errors: error,
    stack: config.NODE_ENV === "development" ? stack : null,
  });
};

import { RequestHandler } from "express";

export const notfound: RequestHandler = (_req, res, _next) => {
  res.status(404).json({
    success: false,
    message: "Resource not found",
    errors: null,
  });
};

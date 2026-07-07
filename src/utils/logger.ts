import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";
import { getRequestId } from "./requestContext";

const logDir = "logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Add a format step that injects requestId into every log
const attachRequestId = winston.format((info) => {
  const requestId = getRequestId();
  if (requestId) info.requestId = requestId;
  return info;
});

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Console format stays human-readable for local dev
const consoleFormat = printf(
  ({ level, message, timestamp, stack, requestId }) => {
    const reqPart = requestId ? `[${requestId}] ` : "";
    return `${timestamp} ${level}: ${reqPart}${stack || message}`;
  },
);

const dailyRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, "application-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d",
  level: "info",
  format: combine(timestamp(), errors({ stack: true }), json()), // <-- JSON in the file
});

const errorRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, "error-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "30d",
  level: "error",
  format: combine(timestamp(), errors({ stack: true }), json()), // <-- JSON in the file
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: combine(
    attachRequestId(),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
  ),
  transports: [dailyRotateTransport, errorRotateTransport],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: combine(colorize(), consoleFormat),
    }),
  );
}

export default logger;

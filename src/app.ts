import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import logger from "./utils/logger";
import routers from "./app/routes";
import { notfound } from "./app/middlewares/notFound";
import { globalErrorHandler } from "./app/middlewares/globalErrorHandler";
import config from "./config";
import { requestIdMiddleware } from "./app/middlewares/requestId";
import helmet from "helmet";
import { generalLimiter } from "./app/middlewares/rateLimiter";
import { metricsMiddleware } from "./app/middlewares/metricsMiddleware";
import { metricsHelper } from "./utils/metrics";
import { APP_CONFIG } from "./constants/constants";
import { stripeWebhookHandler } from "./app/modules/Payment/payment.routes";

class App {
  public app: express.Application;

  constructor() {
    this.app = express();
    this.config();
    this.routes();
    this.handleErrors();
  }

  private config() {
    this.app.use(requestIdMiddleware);
    this.app.use(helmet());
    this.app.use(
      cors({
        origin: [config.FRONTEND_URL, "http://localhost:3000"],
        credentials: true,
        methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
      }),
    );

    // raw routes for stripe webhook payment
    this.app.post(
      "/api/v1/payments/webhook",
      express.raw({ type: "application/json" }),
      stripeWebhookHandler,
    );

    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cookieParser());
    this.app.use(generalLimiter);
    this.app.use(metricsMiddleware);
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.url}`);
      next();
    });
  }

  private routes() {
    // expose metrics endpoint - Prometheus will scrape this
    this.app.get("/metrics", async (req, res) => {
      res.set("Content-Type", metricsHelper.registerMetrics.contentType);
      res.end(await metricsHelper.registerMetrics.metrics());
    });

    // home route
    this.app.get("/", (req, res) => {
      res.status(200).json({
        success: true,
        message: `${APP_CONFIG.APP_NAME} API Server is Running...`,
      });
    });

    this.app.get("/health", (req, res, next) => {
      res.status(200).json({
        message: "Server Health is Ok",
      });
    });

    this.app.use("/api/v1", routers);
  }

  private handleErrors() {
    this.app.use(notfound);
    this.app.use(globalErrorHandler);
  }
}

export default new App().app;

import { createServer, Server } from "http";
import app from "./app";
import logger from "./utils/logger";
import { initSocket } from "./socket";

class AppServer {
  private port: number | string;
  private server: Server;

  constructor() {
    this.port = process.env.PORT || 5000;
    this.server = createServer(app);
    this.startServer();
    this.handleProcessEvents();
  }

  private startServer(): void {
    initSocket(this.server);
    this.server.listen(this.port, () => {
      logger.info(`SERVER IS RUNNING ON PORT ${this.port}`);
    });
  }

  private handleProcessEvents(): void {
    process.on("unhandledRejection", (err) => {
      console.error(
        `Unhandled Rejection detected. Shutting down server...`,
        err,
      );
      this.shutdownServer();
    });

    process.on("uncaughtException", (err) => {
      console.error(
        `Uncaught Exception detected. Shutting down server...`,
        err,
      );
      process.exit(1);
    });
  }

  private shutdownServer(): void {
    if (this.server) {
      this.server.close(() => {
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  }
}

new AppServer();

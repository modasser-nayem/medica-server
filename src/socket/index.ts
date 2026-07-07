import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { socketRegistry } from "./socket.registry";
import { authenticateSocket } from "./middlewares/socketAuth";
import { registerChatHandlers } from "./handlers/chat.handler";
import { registerCallHandlers } from "./handlers/call.handler";
import logger from "../utils/logger";
import { CustomSocket } from "./socket.types";

export const socketManager = {
  isUserOnline: socketRegistry.isUserOnline,
  getUserSockets: socketRegistry.getUserSockets,
  io: null as SocketIOServer | null,
};

export const initSocket = (server: HTTPServer): SocketIOServer => {
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    },
  });

  socketManager.io = io;

  // Authentication middleware
  io.use(authenticateSocket);

  // Connection handler
  io.on("connection", (socket: CustomSocket) => {
    const { userId } = socket.data;
    logger.info(`Socket connected: userId=${userId}, socketId=${socket.id}`);

    const wasOffline = !socketRegistry.isUserOnline(userId);
    socketRegistry.register(userId, socket.id);

    // Join user-specific room for private events
    socket.join(userId);

    // Broadcast online status if this is the user's first active connection
    if (wasOffline) {
      io.emit("user_status", { userId, status: "online" });
    }

    // Modular handlers
    registerChatHandlers(io, socket);
    registerCallHandlers(io, socket);

    // Disconnect handler
    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.id}`);
      socketRegistry.unregister(userId, socket.id);

      // Broadcast offline status if user has no remaining active connections
      if (!socketRegistry.isUserOnline(userId)) {
        io.emit("user_status", { userId, status: "offline" });
      }
    });
  });

  return io;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Server as SocketIOServer } from "socket.io";
import { CustomSocket } from "../socket.types";
import { socketRegistry } from "../socket.registry";
import logger from "../../utils/logger";
import { chatService } from "../../app/modules/Chat/chat.service";

export const registerChatHandlers = (
  io: SocketIOServer,
  socket: CustomSocket,
): void => {
  const { userId } = socket.data;

  // Join thread room
  socket.on("join_thread", ({ threadId }: { threadId: string }) => {
    socket.join(threadId);
    logger.info(`Socket ${socket.id} joined thread room: ${threadId}`);
  });

  // Leave thread room
  socket.on("leave_thread", ({ threadId }: { threadId: string }) => {
    socket.leave(threadId);
    logger.info(`Socket ${socket.id} left thread room: ${threadId}`);
  });

  // User is typing indicator
  socket.on(
    "typing",
    ({ threadId, recipientId }: { threadId: string; recipientId: string }) => {
      const recipientSockets = socketRegistry.getUserSockets(recipientId);
      recipientSockets.forEach((sId) => {
        io.to(sId).emit("user_typing", { threadId, senderId: userId });
      });
    },
  );

  // User stopped typing indicator
  socket.on(
    "stop_typing",
    ({ threadId, recipientId }: { threadId: string; recipientId: string }) => {
      const recipientSockets = socketRegistry.getUserSockets(recipientId);
      recipientSockets.forEach((sId) => {
        io.to(sId).emit("user_stop_typing", { threadId, senderId: userId });
      });
    },
  );

  // Mark messages in a thread as seen
  socket.on("seen_messages", async ({ threadId }: { threadId: string }) => {
    try {
      await chatService.markAsRead(threadId, userId);
      logger.info(
        `Socket ${socket.id} marked messages as read in thread: ${threadId} for user ${userId}`,
      );
    } catch (err) {
      logger.error(`seen_messages error for user ${userId}: ${err}`);
    }
  });

  // Send message via socket
  socket.on(
    "send_message",
    async (payload: {
      recipientId: string;
      text?: string;
      attachment?: string;
      attachments?: string[];
      attachmentType?: string;
      replyToId?: string;
    }) => {
      try {
        const message = await chatService.sendMessage({
          senderId: userId,
          senderRole: socket.data.role,
          senderProfileId: socket.data.profileId!,
          recipientId: payload.recipientId,
          text: payload.text,
          attachment: payload.attachment,
          attachments: payload.attachments,
          attachmentType: payload.attachmentType,
          replyToId: payload.replyToId,
        });

        socket.emit("message_sent", message);
      } catch (err: any) {
        socket.emit("message_error", {
          error: err?.message || "Failed to send message",
        });
        logger.error(`send_message error for user ${userId}: ${err}`);
      }
    },
  );
};

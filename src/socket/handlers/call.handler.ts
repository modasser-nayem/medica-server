import { Server as SocketIOServer } from "socket.io";
import { CustomSocket } from "../socket.types";
import logger from "../../utils/logger";

export const registerCallHandlers = (
  io: SocketIOServer,
  socket: CustomSocket,
): void => {
  const { userId } = socket.data;

  // Accept incoming call
  socket.on(
    "accept_call",
    ({ callId, callerId }: { callId: string; callerId: string }) => {
      io.to(callerId).emit("call_accepted", {
        callId,
        acceptedBy: userId,
      });
      logger.info(`Call ${callId} accepted by ${userId}`);
    },
  );

  // Reject incoming call
  socket.on(
    "reject_call",
    ({ callId, callerId }: { callId: string; callerId: string }) => {
      io.to(callerId).emit("call_rejected", {
        callId,
        rejectedBy: userId,
      });
      logger.info(`Call ${callId} rejected by ${userId}`);
    },
  );

  // End call
  socket.on(
    "end_call",
    ({ callId, recipientId }: { callId: string; recipientId: string }) => {
      io.to(recipientId).emit("call_ended", {
        callId,
        endedBy: userId,
      });
      logger.info(`Call ${callId} ended by ${userId} via socket`);
    },
  );

  // ICE Signaling
  socket.on(
    "call_signal",
    ({
      to,
      signal,
      callId,
    }: {
      to: string;
      signal: unknown;
      callId: string;
    }) => {
      io.to(to).emit("call_signal", {
        from: userId,
        signal,
        callId,
      });
    },
  );
};

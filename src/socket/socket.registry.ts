// In-memory registry for online users: maps userId -> list of active socket IDs
const userSockets = new Map<string, string[]>();

export const socketRegistry = {
  // Registers a socket ID to a user ID.
  register(userId: string, socketId: string): void {
    const sockets = userSockets.get(userId) || [];
    if (!sockets.includes(socketId)) {
      sockets.push(socketId);
    }
    userSockets.set(userId, sockets);
  },

  // Unregisters a socket ID from a user ID.
  unregister(userId: string, socketId: string): void {
    const sockets = userSockets.get(userId) || [];
    const index = sockets.indexOf(socketId);
    if (index !== -1) {
      sockets.splice(index, 1);
    }
    if (sockets.length === 0) {
      userSockets.delete(userId);
    } else {
      userSockets.set(userId, sockets);
    }
  },

  // Checks if a user is currently online (has at least one active connection).
  isUserOnline(userId: string): boolean {
    return userSockets.has(userId);
  },

  // Returns all active socket IDs for a given user.
  getUserSockets(userId: string): string[] {
    return userSockets.get(userId) || [];
  },
};

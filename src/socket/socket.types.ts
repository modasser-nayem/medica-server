/* eslint-disable @typescript-eslint/no-explicit-any */
import { Socket } from "socket.io";
import { UserRole } from "@prisma/client";

export interface SocketUserData {
  userId: string;
  role: UserRole;
  profileId?: string;
}

// CustomSocket is a strongly-typed Socket.io Socket instance that carries user session data
export type CustomSocket = Socket<any, any, any, SocketUserData>;

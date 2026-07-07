import { ExtendedError } from "socket.io/dist/namespace";
import jwtHelper from "../../shared/jwtHelpers";
import { CustomSocket } from "../socket.types";

// Helper to parse cookies from handshake headers
const parseCookies = (cookieString?: string): Record<string, string> => {
  const cookies: Record<string, string> = {};
  if (!cookieString) return cookies;
  cookieString.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const name = parts[0].trim();
    const value = parts.slice(1).join("=").trim();
    if (name) {
      cookies[name] = decodeURIComponent(value);
    }
  });
  return cookies;
};

/**
 * Socket.io authentication middleware. Verifies access token from handshake auth, query parameters, or HttpOnly cookie.
 */
export const authenticateSocket = (
  socket: CustomSocket,
  next: (err?: ExtendedError) => void,
): void => {
  let token = socket.handshake.auth?.token || socket.handshake.query?.token;

  // Try reading from httpOnly cookie 'accessToken' if not provided in auth/query
  if (!token) {
    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = parseCookies(cookieHeader);
    token = cookies["accessToken"];
  }

  if (!token || typeof token !== "string") {
    return next(new Error("Authentication error: Token is required"));
  }

  try {
    const decoded = jwtHelper.verifyAccessToken(token);
    if (!decoded) {
      return next(new Error("Authentication error: Invalid token"));
    }
    socket.data = {
      userId: decoded.userId,
      role: decoded.role,
      profileId: decoded.profileId,
    };
    next();
  } catch (error) {
    return next(new Error("Authentication error: Token verification failed"));
  }
};

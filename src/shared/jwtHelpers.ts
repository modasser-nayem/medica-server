import jwt, { JwtPayload } from "jsonwebtoken";
import config from "../config";
import { UserRole } from "@prisma/client";

export type TSignTokenPayload = {
  userId: string;
  role: UserRole;
};

const signAccessToken = (payload: TSignTokenPayload) => {
  return jwt.sign(payload, config.token.ACCESS_TOKEN_SECRET, {
    expiresIn: config.token.ACCESS_EXPIRES_IN as "5d",
  });
};

const verifyAccessToken = (token: string) => {
  return jwt.verify(token, config.token.ACCESS_TOKEN_SECRET) as JwtPayload &
    TSignTokenPayload;
};

const signRefreshToken = (payload: TSignTokenPayload) => {
  return jwt.sign(payload, config.token.REFRESH_TOKEN_SECRET, {
    expiresIn: config.token.REFRESH_EXPIRES_IN as "30d",
  });
};

const verifyRefreshToken = (token: string) => {
  return jwt.verify(token, config.token.REFRESH_TOKEN_SECRET) as JwtPayload &
    TSignTokenPayload;
};

const jwtHelper = {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyAccessToken,
};
export default jwtHelper;

import { NextFunction, Request, Response } from "express";
import AppError from "../../errors/AppError";
import { asyncHandler } from "../../shared/catchAsync";
import { UserRole } from "@prisma/client";
import prisma from "../../db/connector";
import { COOKIE_NAME } from "../../shared/cookie";
import jwtHelper from "../../shared/jwtHelpers";

export const authorize = (...roles: UserRole[]) => {
  return asyncHandler(
    async (req: Request, _res: Response, next: NextFunction) => {
      const token = req.cookies[COOKIE_NAME.ACCESS_TOKEN];
      if (!token) throw new AppError(401, "unauthorized access");

      const decoded = jwtHelper.verifyAccessToken(token);
      if (!decoded) throw new AppError(401, "invalid access token");

      if (roles.length && !roles.includes(decoded.role)) {
        throw new AppError(
          403,
          "You don't have permission to access this data!",
        );
      }

      let profileId: string | undefined = decoded.profileId;

      if (decoded.userId && decoded.role !== "ADMIN") {
        if (decoded.role === "PATIENT") {
          const patient = await prisma.patient.findUnique({
            where: { userId: decoded.userId },
            select: { id: true },
          });
          profileId = patient?.id;
        } else if (decoded.role === "DOCTOR") {
          const doctor = await prisma.doctor.findUnique({
            where: { userId: decoded.userId },
            select: { id: true },
          });
          profileId = doctor?.id;
        }
      }

      req.user = { ...decoded, profileId };
      next();
    },
  );
};

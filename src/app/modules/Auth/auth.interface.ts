import { z } from "zod";
import { authSchemaValidation } from "./auth.validation";
import { AuthProvider, UserRole, UserStatus, UserTier } from "@prisma/client";

export type TUserRegistration = z.infer<
  typeof authSchemaValidation.userRegistration
>;

export type TChangePassword = z.infer<
  typeof authSchemaValidation.changePassword
>;

export interface TUserLogin {
  email: string;
  password: string;
}

export interface TRefreshToken {
  token: string;
}

export type TForgotPassword = {
  email: string;
};

export type TResetPassword = z.infer<typeof authSchemaValidation.resetPassword>;

export type TVerifyOtp = z.infer<typeof authSchemaValidation.verifyOtp>;

export interface IUserFilters {
  role?: UserRole;
  status?: UserStatus;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export type TAuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string | null;
  status: UserStatus;
  tier: UserTier;
  provider: AuthProvider;
  isEmailVerified: boolean;
};

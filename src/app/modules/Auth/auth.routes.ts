import express from "express";
import requestValidate from "../../middlewares/requestValidation";
import { authSchemaValidation } from "./auth.validation";
import { authController } from "./auth.controller";
import { authorize } from "../../middlewares/authorize";
import { authLimiter } from "../../middlewares/rateLimiter";

const router = express.Router();

// Register User
router.post(
  "/register",
  authLimiter,
  requestValidate(authSchemaValidation.userRegistration),
  authController.registerUser,
);

// Logged In User
router.post(
  "/login",
  authLimiter,
  requestValidate(authSchemaValidation.loginUser),
  authController.loginUser,
);

// Logged Out User
router.post("/logout", authorize(), authController.logoutUser);

// Refresh token
router.post("/refresh", authorize(), authController.refreshToken);

// Forgot Password
router.post(
  "/forgot-password",
  authLimiter,
  requestValidate(authSchemaValidation.forgotPassword),
  authController.forgotPassword,
);

// Verify OTP
router.post(
  "/verify-otp",
  authLimiter,
  requestValidate(authSchemaValidation.verifyOtp),
  authController.verifyOtp,
);

// Reset Password
router.put(
  "/reset-password",
  authLimiter,
  requestValidate(authSchemaValidation.resetPassword),
  authController.resetPassword,
);

// Change Password
router.put(
  "/change-password",
  authLimiter,
  authorize(),
  requestValidate(authSchemaValidation.changePassword),
  authController.changePassword,
);

// Auth user
router.get("/me", authorize(), authController.getAuthUser);

export const authRoutes = router;

import { z } from "zod";

const userRegistration = z.object({
  body: z
    .object({
      name: z
        .string({ required_error: "name is required" })
        .min(3, "Name must be at least 3 characters")
        .max(50, "Name too long"),
      email: z
        .string({ required_error: "email is required" })
        .email("Invalid email address"),
      role: z.enum(["PATIENT", "DOCTOR", "ADMIN"], {
        required_error: "role is required",
      }),
      password: z
        .string({ required_error: "password is required" })
        .min(6, "Password must be at least 6 characters"),
      confirmPassword: z.string({
        required_error: "confirmPassword is required",
      }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    }),
});

const loginUser = z.object({
  body: z.object({
    email: z
      .string({ required_error: "email is required" })
      .email({ message: "Invalid email address" }),
    password: z
      .string({ required_error: "password is required" })
      .min(1, { message: "password is required" }),
  }),
});

const forgotPassword = z.object({
  body: z.object({
    email: z
      .string({ required_error: "email is required" })
      .email({ message: "Invalid email address" }),
  }),
});

const resetPassword = z.object({
  body: z
    .object({
      email: z
        .string({ required_error: "email is required" })
        .email({ message: "Invalid email address" }),
      newPassword: z
        .string({ required_error: "newPassword is required" })
        .min(6, "New Password must be at least 6 characters"),
      confirmPassword: z
        .string({ required_error: "confirm password is required" })
        .min(1, { message: "Confirm Password is required" }),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    }),
});

const verifyOtp = z.object({
  body: z.object({
    email: z
      .string({ required_error: "email is required" })
      .email({ message: "Invalid email address" }),
    otp: z.number({ required_error: "otp is required" }),
  }),
});

const changePassword = z.object({
  body: z
    .object({
      currentPassword: z
        .string({ required_error: "currentPassword is required" })
        .min(1, { message: "currentPassword is required" }),
      newPassword: z
        .string({ required_error: "newPassword is required" })
        .min(6, "New Password must be at least 6 characters"),
      confirmPassword: z
        .string({ required_error: "confirm password is required" })
        .min(1, { message: "Confirm Password is required" }),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    }),
});

export const authSchemaValidation = {
  userRegistration,
  loginUser,
  forgotPassword,
  resetPassword,
  verifyOtp,
  changePassword,
};

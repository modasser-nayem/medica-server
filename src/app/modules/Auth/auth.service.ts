import config from "../../../config";
import prisma from "../../../db/connector";
import AppError from "../../../errors/AppError";
import { emailHelper } from "../../../mail";
import {
  TUserRegistration,
  TChangePassword,
  TForgotPassword,
  TRefreshToken,
  TResetPassword,
  TUserLogin,
  TAuthUser,
  TVerifyOtp,
} from "./auth.interface";
import { generateOtp } from "./auth.utils";
import { metricsHelper } from "../../../utils/metrics";
import passwordHelper from "../../../utils/password";
import jwtHelper from "../../../shared/jwtHelpers";

const registerUser = async (data: TUserRegistration) => {
  // Check if user already exists
  const existUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existUser) {
    throw new AppError(400, "User with this email already exists");
  }

  // Hashed Password
  data.password = await passwordHelper.hashPassword(data.password);

  await prisma.$transaction(async (tran) => {
    const { confirmPassword, ...userData } = data;

    const user = await tran.user.create({
      data: userData,
    });

    if (userData.role === "PATIENT") {
      await tran.patient.create({
        data: {
          userId: user.id,
        },
      });
    }

    if (userData.role === "DOCTOR") {
      await tran.doctor.create({
        data: {
          userId: user.id,
        },
      });
    }

    return user;
  });

  return null;
};

const loginUser = async (payload: {
  data: TUserLogin;
  userAgent: string;
  ipAddress: string;
}) => {
  const user = await prisma.user.findUnique({
    where: { email: payload.data.email },
    include: {
      patientProfile: { select: { id: true } },
      doctorProfile: { select: { id: true } },
    },
  });

  if (!user) {
    metricsHelper.loginAttemptsTotal.labels("failure").inc();
    throw new AppError(400, "Invalid email address");
  }

  // Check if user is active
  if (!user.isActive || user.isDeleted) {
    metricsHelper.loginAttemptsTotal.labels("failure").inc();
    throw new AppError(
      400,
      "Account is deactivated. Please contact administrator.",
    );
  }

  // Verify password
  const isPasswordValid = await passwordHelper.comparePassword(
    payload.data.password,
    user.password,
  );
  if (!isPasswordValid) {
    metricsHelper.loginAttemptsTotal.labels("failure").inc();
    throw new AppError(400, "Incorrect password!");
  }

  if (user.role !== "ADMIN" && !user.patientProfile && !user.doctorProfile) {
    metricsHelper.loginAttemptsTotal.labels("failure").inc();
    throw new AppError(404, "Profile not found! contact in support");
  }

  // Generate tokens
  const accessToken = jwtHelper.signAccessToken({
    userId: user.id,
    role: user.role,
    profileId:
      user.role === "DOCTOR" ? user.doctorProfile?.id : user.patientProfile?.id,
  });
  const refreshToken = jwtHelper.signRefreshToken({
    userId: user.id,
    role: user.role,
    profileId:
      user.role === "DOCTOR" ? user.doctorProfile?.id : user.patientProfile?.id,
  });

  const authUser: TAuthUser = {
    id: user.id,
    name: user.name,
    role: user.role,
    profileImage: user.profileImage,
    profileId: user.patientProfile
      ? user.patientProfile.id
      : user.doctorProfile
        ? user.doctorProfile.id
        : undefined,
  };

  metricsHelper.loginAttemptsTotal.labels("success").inc();

  return {
    accessToken,
    refreshToken,
    user: authUser,
  };
};

const refreshToken = async (data: TRefreshToken) => {
  let decodeUser = jwtHelper.verifyRefreshToken(data.token);

  if (!decodeUser?.userId) {
    throw new AppError(400, "Expires Refresh Token");
  }

  const user = await prisma.user.findUnique({
    where: { id: decodeUser.userId },
    include: {
      patientProfile: { select: { id: true } },
      doctorProfile: { select: { id: true } },
    },
  });

  if (!user) {
    throw new AppError(404, "User not found!");
  }

  // Generate token
  const accessToken = jwtHelper.signAccessToken({
    userId: user.id,
    role: user.role,
    profileId:
      user.role === "DOCTOR" ? user.doctorProfile?.id : user.patientProfile?.id,
  });

  const authUser: TAuthUser = {
    id: user.id,
    name: user.name,
    role: user.role,
    profileImage: user.profileImage,
    profileId: user.patientProfile
      ? user.patientProfile.id
      : user.doctorProfile
        ? user.doctorProfile.id
        : undefined,
  };

  return { accessToken, user: authUser };
};

const forgotPassword = async (data: TForgotPassword) => {
  const normalizedEmail = data.email.toLowerCase().trim();

  // Find user
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    // Don't reveal if user exists or not
    return null;
  }

  if (!user.isActive || user.isDeleted) {
    throw new AppError(
      400,
      "Account is deactivated. Please contact administrator.",
    );
  }

  const { otp, expiresAt, expireMinute } = generateOtp();

  // Invalidate any previous unverified OTPs for this user
  await prisma.otp.create({
    data: {
      code: otp,
      type: "FORGOT_PASSWORD",
      email: normalizedEmail,
      expiresAt,
    },
  });

  const htmlTemplate = emailHelper.mailTemplate.forgotPasswordEmail({
    userName: user.name,
    otp,
    expireMinute,
  });

  await emailHelper.sendEmail({
    to: normalizedEmail,
    subject: "Reset Your Password",
    htmlTemplate: htmlTemplate,
  });

  return { expiresAt, expireMinute };
};

const verifyOtp = async (payload: TVerifyOtp) => {
  const normalizedEmail = payload.email.toLowerCase().trim();
  const maxAttempts = 3;

  const otpData = await prisma.otp.findFirst({
    where: {
      email: normalizedEmail,
      isVerified: false,
      isUsed: false,
      type: "FORGOT_PASSWORD",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpData) {
    throw new AppError(
      400,
      "OTP not found or has expired. Please request a new OTP.",
    );
  }

  if (otpData.attempts >= maxAttempts) {
    throw new AppError(
      400,
      "Maximum OTP attempts exceeded. Please request a new OTP.",
    );
  }

  // Check expiration
  const currentTime = new Date();
  if (currentTime > otpData.expiresAt) {
    throw new AppError(400, "OTP has expired. Please request a new OTP.");
  }

  // If OTP does not match, increment attempts
  if (otpData.code !== payload.otp) {
    const nextAttempts = otpData.attempts + 1;
    await prisma.otp.update({
      where: { id: otpData.id },
      data: { attempts: nextAttempts },
    });

    if (nextAttempts >= maxAttempts) {
      throw new AppError(
        400,
        "Maximum OTP attempts exceeded. Please request a new OTP.",
      );
    }

    throw new AppError(
      400,
      `Invalid OTP. You have ${maxAttempts - nextAttempts} attempts left.`,
    );
  }

  await prisma.otp.update({
    where: { id: otpData.id },
    data: {
      isVerified: true,
      verifiedAt: new Date(),
      attempts: otpData.attempts + 1,
    },
  });

  return {
    isVerified: true,
    message: "OTP successfully verified",
    email: normalizedEmail,
  };
};

const resetPassword = async (data: TResetPassword) => {
  const normalizedEmail = data.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    throw new AppError(400, "User not found!");
  }

  if (!user.isActive || user.isDeleted) {
    throw new AppError(
      400,
      "Account is deactivated. Please contact administrator.",
    );
  }

  // Check if OTP was verified
  const verifiedOtp = await prisma.otp.findFirst({
    where: {
      email: normalizedEmail,
      isVerified: true,
      type: "FORGOT_PASSWORD",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!verifiedOtp) {
    throw new AppError(400, "Please verify OTP first!");
  }

  if (verifiedOtp.isUsed) {
    throw new AppError(400, "OTP already used, please request a new OTP");
  }

  // Check verified expire (10 minutes)
  if (verifiedOtp.verifiedAt) {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (verifiedOtp.verifiedAt < tenMinutesAgo) {
      throw new AppError(
        400,
        "OTP verification expired. Please request a new OTP.",
      );
    }
  }

  const hashedPassword = await passwordHelper.hashPassword(data.newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
      },
    });

    await tx.otp.update({
      where: { id: verifiedOtp.id },
      data: {
        isUsed: true,
      },
    });
  });

  return null;
};

const changePassword = async (payload: {
  userId: string;
  data: TChangePassword;
}) => {
  const { userId, data } = payload;

  const existUser = await prisma.user.findUnique({ where: { id: userId } });

  if (!existUser) {
    throw new AppError(404, "User not found!");
  }

  // Check provided current password is correct
  if (
    !(await passwordHelper.comparePassword(
      data.currentPassword,
      existUser.password,
    ))
  ) {
    throw new AppError(400, "Current password is incorrect");
  }

  data.newPassword = await passwordHelper.hashPassword(data.newPassword);

  await prisma.user.update({
    where: {
      id: existUser.id,
    },
    data: {
      password: data.newPassword,
    },
  });

  return null;
};

const getAuthUser = async (payload: { userId: string }): Promise<TAuthUser> => {
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      name: true,
      role: true,
      profileImage: true,
      patientProfile: { select: { id: true } },
      doctorProfile: { select: { id: true } },
    },
  });

  if (!user) throw new AppError(404, "User not found!");

  return {
    id: user.id,
    name: user.name,
    role: user.role,
    profileImage: user.profileImage,
    profileId: user.patientProfile
      ? user.patientProfile.id
      : user.doctorProfile
        ? user.doctorProfile.id
        : undefined,
  };
};

export const authService = {
  registerUser,
  loginUser,
  refreshToken,
  forgotPassword,
  verifyOtp,
  resetPassword,
  changePassword,
  getAuthUser,
};

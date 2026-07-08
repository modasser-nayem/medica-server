import { Prisma } from "@prisma/client";
import prisma from "../../../db/connector";
import AppError from "../../../errors/AppError";
import {
  TGetUsersFilter,
  TUpdateDoctorProfile,
  TUpdatePatientProfile,
  TUpdateUserProfile,
} from "./user.interface";
import { paginationHelper } from "../../../utils/pagination";

// Get user profile
const getUserProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      doctorProfile: true,
      patientProfile: true,
    },
  });

  if (!user) {
    throw new AppError(404, "User not found!");
  }

  const { password, ...result } = user;

  return result;
};

// Update User Information
const updateUserInformation = async (payload: {
  userId: string;
  data: TUpdateUserProfile;
}) => {
  const { data } = payload;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!user) {
    throw new AppError(404, "Profile not found!");
  }

  if (data.email) {
    const existEmail = await prisma.user.findUnique({
      where: { email: data.email, NOT: { id: user.id } },
    });

    if (existEmail) {
      throw new AppError(400, "Try another email address");
    }
  }

  const updatedData = await prisma.user.update({
    where: {
      id: user.id,
    },
    data,
  });

  const { password, ...result } = updatedData;

  return result;
};

// Update Patient Profile
const updatePatientProfile = async (payload: {
  userId: string;
  data: TUpdatePatientProfile;
}) => {
  const { data } = payload;

  const patient = await prisma.patient.findUnique({
    where: { userId: payload.userId },
  });

  if (!patient) {
    throw new AppError(404, "Profile not found!");
  }

  const result = await prisma.patient.update({
    where: {
      id: patient.id,
    },
    data,
  });

  return result;
};

// Update Doctor Profile
const updateDoctorProfile = async (payload: {
  userId: string;
  data: TUpdateDoctorProfile;
}) => {
  const { data } = payload;

  const doctor = await prisma.doctor.findUnique({
    where: { userId: payload.userId },
  });

  if (!doctor) {
    throw new AppError(404, "Profile not found!");
  }

  const result = await prisma.doctor.update({
    where: {
      id: doctor.id,
    },
    data,
  });

  return result;
};

// Get Users
const getUsers = async (filters: TGetUsersFilter) => {
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelper.calculatePagination({
      page: filters.page,
      limit: filters.limit,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });

  const { search, active, role } = filters;

  const where: Prisma.UserWhereInput = {};

  if (role) {
    where.role = role;
  }

  if (active) {
    if (active === "yes" || active === "no") {
      where.isActive = active === "yes" ? true : false;
    }
  }

  if (search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const select: Prisma.UserSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    dateOfBirth: true,
    gender: true,
    address: true,
    profileImage: true,
    role: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  };

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Update User Status
const updateUserStatus = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError(404, "User not found!");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: user.isActive ? false : true },
  });

  return null;
};

// Delete User
const deleteUser = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError(404, "User not found!");
  }

  // Soft Delete
  await prisma.user.update({
    where: { id: userId },
    data: { isDeleted: true },
  });

  return user;
};

export const userService = {
  getUserProfile,
  updateUserInformation,
  updatePatientProfile,
  updateDoctorProfile,
  getUsers,
  updateUserStatus,
  deleteUser,
};

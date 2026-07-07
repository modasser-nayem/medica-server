import { Prisma, UserStatus } from "@prisma/client";
import prisma from "../../../db/connector";
import AppError from "../../../errors/AppError";
import { TGetUsersFilter, TUpdateUserProfile } from "./user.interface";
import { paginationHelper } from "../../../utils/pagination";

// Get user profile
const getUserProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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
    throw new AppError(404, "User not found!");
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

// Get Users
const getUsers = async (filters: TGetUsersFilter) => {
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelper.calculatePagination({
      page: filters.page,
      limit: filters.limit,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });

  const { search, status, role } = filters;

  const where: Prisma.UserWhereInput = {};

  if (role) {
    where.role = role;
  }

  if (status) {
    where.status = status;
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
    avatar: true,
    role: true,
    status: true,
    tier: true,
    provider: true,
    isEmailVerified: true,
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

  const newStatus: UserStatus = user.status === "UNBLOCK" ? "BLOCKED" : "UNBLOCK";

  await prisma.user.update({
    where: { id: userId },
    data: { status: newStatus },
  });

  return null;
};

// Delete User (Hard Delete)
const deleteUser = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError(404, "User not found!");
  }

  await prisma.user.delete({
    where: { id: userId },
  });

  return user;
};

export const userService = {
  getUserProfile,
  updateUserInformation,
  getUsers,
  updateUserStatus,
  deleteUser,
};

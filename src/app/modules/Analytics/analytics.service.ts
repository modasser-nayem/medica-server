import { Prisma } from "@prisma/client";
import prisma from "../../../db/connector";

import {
  IAdminStats,
  IDoctorStats,
  IGetUserActivityFilters,
  IPatientStats,
  IPublicStats,
} from "./analytics.interface";
import { endOfToday, startOfToday } from "../../../utils/datetime";
import { paginationHelper } from "../../../utils/pagination";

const getAdminStats = async (): Promise<IAdminStats> => {
  const users = await prisma.user.findMany({
    where: { isDeleted: false },
    select: { id: true, role: true, isActive: true },
  });

  const activeUsers = users.filter((user) => user.isActive === true).length;

  const totalDoctor = users.filter((user) => user.role === "DOCTOR").length;

  const totalPatient = users.filter((user) => user.role === "PATIENT").length;

  const payments = await prisma.payment.findMany({
    where: { status: "COMPLETED" },
  });

  const totalRevenue = payments.reduce(
    (acc, payment) => acc + Number(payment.amount),
    0,
  );

  const completedAppointments = await prisma.appointment.count({
    where: { status: "COMPLETED" },
  });

  const todaysAppointments = await prisma.appointment.count({
    where: {
      startsAt: { gte: startOfToday },
      endsAt: { lte: endOfToday },
    },
  });

  const result = {
    totalUsers: users.length,
    activeUsers,
    totalDoctor,
    totalPatient,
    totalRevenue,
    completedAppointments,
    todaysAppointments,
  };

  return result;
};

const getDoctorStats = async (userId: string): Promise<IDoctorStats> => {
  const user = await prisma.doctor.findUnique({
    where: { userId },
    select: { id: true },
  });

  const doctorId = user?.id;

  const completedAppointments = await prisma.appointment.count({
    where: {
      doctorId: doctorId,
      status: "COMPLETED",
    },
  });

  const pendingAppointments = await prisma.appointment.count({
    where: {
      doctorId: doctorId,
      status: "CONFIRMED",
    },
  });

  const todaysAppointments = await prisma.appointment.count({
    where: {
      doctorId,
      startsAt: {
        gte: startOfToday,
      },
      endsAt: {
        lte: endOfToday,
      },
    },
  });

  // Upcoming appointment
  const upcomingAppointment = await prisma.appointment.findFirst({
    where: {
      doctorId: doctorId,
    },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      startsAt: true,
    },
  });

  const result = {
    completedAppointments,
    pendingAppointments,
    todaysAppointments,
    upcomingAppointment,
  };

  return result;
};

const getPatientStats = async (userId: string): Promise<IPatientStats> => {
  const user = await prisma.patient.findUnique({
    where: { userId },
    select: { id: true },
  });

  const patientId = user?.id;

  const completedAppointments = await prisma.appointment.count({
    where: {
      patientId,
      status: "COMPLETED",
    },
  });

  const pendingAppointments = await prisma.appointment.count({
    where: {
      patientId,
      status: "PENDING",
    },
  });

  const scheduledAppointments = await prisma.appointment.count({
    where: {
      patientId,
      status: "CONFIRMED",
    },
  });

  // Upcoming appointment
  const upcomingAppointment = await prisma.appointment.findFirst({
    where: {
      patientId,
    },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      startsAt: true,
    },
  });

  const result = {
    completedAppointments,
    pendingAppointments,
    scheduledAppointments,
    upcomingAppointment,
  };

  return result;
};

const getPublicStats = async (): Promise<IPublicStats> => {
  const totalUsers = await prisma.user.count();

  const totalDoctors = await prisma.doctor.count();

  const completedAppointments = await prisma.appointment.count({
    where: { status: "COMPLETED" },
  });

  return { totalUsers, totalDoctors, completedAppointments };
};

// Get User Activity
const getUserActivity = async (filters: IGetUserActivityFilters) => {
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelper.calculatePagination({
      page: filters.page,
      limit: filters.limit,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });

  const where: Prisma.AuditLogWhereInput = {};
  const select: Prisma.AuditLogSelect = {
    id: true,
    userId: true,
    user: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
    action: true,
    details: true,
    ipAddress: true,
    userAgent: true,
    createdAt: true,
  };

  if (filters.userId) {
    where.userId = filters.userId;
  }

  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.startDate && filters.endDate) {
    where.createdAt = {
      gte: new Date(filters.startDate),
      lte: new Date(filters.endDate),
    };
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.auditLog.count({ where }),
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

export const analyticsService = {
  getAdminStats,
  getDoctorStats,
  getPatientStats,
  getPublicStats,
  getUserActivity,
};

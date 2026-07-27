import { Prisma } from "@prisma/client";
import prisma from "../../../db/connector";
import AppError from "../../../errors/AppError";
import { TGetDoctorsFilter } from "./doctor.interface";
import { paginationHelper } from "../../../utils/pagination";
import { generateSlots } from "../../../utils/datetime";
import { addDays } from "date-fns";

// Get Top Rated Doctors (top 6)
const getTopRatedDoctors = async () => {
  const doctors = await prisma.doctor.findMany({
    where: { user: { isActive: true, isDeleted: false } },
    select: {
      id: true,
      specialties: true,
      qualification: true,
      experience: true,
      consultationFee: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          profileImage: true,
        },
      },
      reviews: {
        select: {
          rating: true,
        },
      },
      _count: {
        select: {
          reviews: true,
        },
      },
    },
  });

  const enrichedDoctors = doctors.map((doctor) => {
    const totalReviews = doctor._count.reviews || 0;
    const totalRating = doctor.reviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;
    const { reviews, _count, ...rest } = doctor;
    return {
      ...rest,
      totalReviews,
      averageRating: Number(averageRating.toFixed(2)),
    };
  });

  return enrichedDoctors
    .sort((a, b) => {
      const ratingDiff = b.averageRating - a.averageRating;
      if (ratingDiff !== 0) return ratingDiff;
      return b.totalReviews - a.totalReviews;
    })
    .slice(0, 6);
};

// Get Doctors
const getDoctors = async (filters: TGetDoctorsFilter) => {
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelper.calculatePagination({
      page: filters.page,
      limit: filters.limit,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
  const rating = Number(filters.rating);
  const { search, specialty, department } = filters;

  const where: Prisma.DoctorWhereInput = {
    user: { isActive: true, isDeleted: false },
  };

  if (specialty) {
    where.specialties = { contains: specialty, mode: "insensitive" };
  }

  if (search) {
    where.user = { name: { contains: search, mode: "insensitive" } };
  }

  if (rating) {
    where.reviews = { some: { rating: { gte: rating } } };
  }

  if (department) {
    where.department = { id: department };
  }

  // Fetch doctors
  const doctors = await prisma.doctor.findMany({
    where,
    select: {
      id: true,
      specialties: true,
      qualification: true,
      experience: true,
      consultationFee: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          profileImage: true,
        },
      },
      reviews: {
        select: {
          rating: true,
        },
      },
      _count: {
        select: {
          reviews: true,
        },
      },
    },
    skip,
    take: limit,
  });

  // Calculate Average Rating for each doctor
  const enrichedDoctors = doctors.map((doctor) => {
    const totalReviews = doctor._count.reviews || 0;

    const totalRating = doctor.reviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;

    const { reviews, _count, ...rest } = doctor;

    return {
      ...rest,
      totalReviews,
      averageRating: Number(averageRating.toFixed(2)),
    };
  });

  // Sorting based on user provided sort
  const sortedDoctors = enrichedDoctors.sort((a, b) => {
    if (sortBy === "rating") {
      return sortOrder === "asc"
        ? a.averageRating - b.averageRating
        : b.averageRating - a.averageRating;
    }

    if (sortBy === "createdAt") {
      return sortOrder === "asc"
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }

    return 0;
  });

  const total = await prisma.doctor.count({ where });
  const paginatedDoctors = sortedDoctors.slice(0, limit); // already skipped during query

  return {
    data: paginatedDoctors,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Get Doctor Details
const getDoctorDetails = async (doctorId: string) => {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: {
      id: true,
      specialties: true,
      qualification: true,
      experience: true,
      bio: true,
      consultationFee: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          dateOfBirth: true,
          gender: true,
          address: true,
          profileImage: true,
        },
      },
      _count: {
        select: {
          reviews: true,
        },
      },
    },
  });

  if (!doctor) {
    throw new AppError(400, "Invalid Doctor ID");
  }

  const {
    id,
    specialties,
    qualification,
    experience,
    user,
    consultationFee,
    _count,
  } = doctor;

  const totalReviews = _count?.reviews || 0;

  const result = {
    id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth,
    gender: user.gender,
    address: user.address,
    profileImage: user.profileImage,
    specialties,
    qualification,
    experience,
    userId: user.id,
    consultationFee,
    totalReviews,
  };

  return result;
};

const getDoctorAvailableSlots = async (
  doctorId: string,
  startDate = new Date(),
  days = 7,
) => {
  // Normalize startDate to UTC Midnight
  const startDay = new Date(
    Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  const endDate = addDays(startDay, days - 1);

  // get doctor timezone
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: { timezone: true },
  });
  const timezone = doctor?.timezone || "UTC";

  // get recurring schedules
  const schedules = await prisma.schedule.findMany({
    where: { doctorId },
  });

  // get exceptions in range
  const exceptions = await prisma.scheduleException.findMany({
    where: {
      doctorId,
      date: { gte: startDay, lte: endDate },
    },
  });

  // get already booked appointments
  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { gte: startDay, lte: endDate },
    },
  });

  const daysList = [];
  for (let i = 0; i < days; i++) {
    daysList.push(new Date(startDay.getTime() + i * 24 * 60 * 60 * 1000));
  }

  const results = [];

  for (const day of daysList) {
    const weekday = day.getUTCDay(); // 0=Sun (UTC)
    const baseSchedule = schedules.find((s) => s.dayOfWeek === weekday);
    if (!baseSchedule || !baseSchedule.isActive) {
      continue;
    }

    // Check exception in UTC
    const exception = exceptions.find(
      (e) =>
        e.date.getUTCFullYear() === day.getUTCFullYear() &&
        e.date.getUTCMonth() === day.getUTCMonth() &&
        e.date.getUTCDate() === day.getUTCDate(),
    );

    if (exception?.closed) {
      continue;
    }

    const startTime = exception?.startTime ?? baseSchedule.startTime;
    const endTime = exception?.endTime ?? baseSchedule.endTime;
    const duration = baseSchedule.slotDurationMinutes;

    let slots = generateSlots(day, startTime, endTime, duration, timezone);

    // Filter out booked
    const bookedTimes = appointments.map((a) => a.startsAt.getTime());
    slots = slots.filter((slot) => !bookedTimes.includes(slot.getTime()));

    // Filter out past slots
    const now = new Date();
    slots = slots.filter((slot) => slot.getTime() > now.getTime());

    // Filter out exception.blockedSlots
    if (exception?.blockedSlots?.length) {
      slots = slots.filter((slot) => {
        const h = slot.getUTCHours().toString().padStart(2, "0");
        const m = slot.getUTCMinutes().toString().padStart(2, "0");
        const hhmm = `${h}:${m}`;
        return !exception.blockedSlots.includes(hhmm);
      });
    }

    // Format output date in UTC yyyy-MM-dd
    const year = day.getUTCFullYear();
    const month = (day.getUTCMonth() + 1).toString().padStart(2, "0");
    const dateStr = day.getUTCDate().toString().padStart(2, "0");
    const dateFormatted = `${year}-${month}-${dateStr}`;

    results.push({
      date: dateFormatted,
      slots: slots.map((s) => {
        const h = s.getUTCHours().toString().padStart(2, "0");
        const m = s.getUTCMinutes().toString().padStart(2, "0");
        return `${h}:${m}`;
      }),
      duration,
    });
  }
  return results;
};

export const doctorService = {
  getDoctors,
  getTopRatedDoctors,
  getDoctorDetails,
  getDoctorAvailableSlots,
};

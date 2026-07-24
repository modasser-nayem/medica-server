import { Prisma } from "@prisma/client";
import prisma from "../../../db/connector";
import AppError from "../../../errors/AppError";
import {
  TCreateAppointment,
  IGetAppointmentsFilters,
  TRescheduleAppointment,
  TCancelAppointment,
} from "./appointment.interface";
import { doctorService } from "../Doctor/doctor.service";
import { addMinutes, format } from "date-fns";
import { paginationHelper } from "../../../utils/pagination";
import { paymentService } from "../Payment/payment.service";

const createAppointment = async (data: TCreateAppointment) => {
  const startsAt = new Date(data.startsAt);

  // Get available slots for that day
  const slots = await doctorService.getDoctorAvailableSlots(
    data.doctorId,
    startsAt,
    1,
  );

  if (!slots.length) {
    throw new AppError(400, "Slot not available");
  }

  const daySlots: string[] = slots[0]?.slots ?? [];

  const hh = startsAt.getUTCHours().toString().padStart(2, "0");
  const mm = startsAt.getUTCMinutes().toString().padStart(2, "0");
  const hhmm = `${hh}:${mm}`;
  if (!daySlots.includes(hhmm)) {
    throw new AppError(400, "Slot not available");
  }

  // Calculate end time
  const endsAt = addMinutes(startsAt, slots[0]?.duration!);

  // Check for Conflicting Appointments for the Patient
  const patientConflict = await prisma.appointment.findFirst({
    where: {
      patientId: data.patientId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { gte: startsAt, lte: endsAt },
    },
  });

  if (patientConflict) {
    throw new AppError(400, "You already have an appointment at this time.");
  }

  // Check for Conflicting Appointments for the Doctor
  const doctorConflict = await prisma.appointment.findFirst({
    where: {
      doctorId: data.doctorId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: startsAt,
    },
  });

  if (doctorConflict) {
    throw new AppError(400, "The doctor is already booked at this time.");
  }

  const doctor = await prisma.doctor.findUnique({
    where: { id: data.doctorId },
  });

  if (!doctor) {
    throw new AppError(404, "Doctor not found");
  }

  const feeAmount = Number(doctor.consultationFee);
  const currency = "BDT";

  // 4. Create appointment (status = PENDING until payment completes)
  const newApt = await prisma.appointment.create({
    data: {
      patientId: data.patientId,
      doctorId: data.doctorId,
      startsAt: startsAt,
      endsAt: endsAt,
      price: doctor.consultationFee,
      currency: currency,
      status: "PENDING",
    },
  });

  const intent = await paymentService.createCheckoutSession({
    amount: feeAmount,
    currency: currency,
    metadata: {
      appointmentId: newApt.id,
      patientId: data.patientId,
      doctorId: data.doctorId,
    },
  });

  return {
    appointmentId: newApt.id,
    checkoutUrl: intent.checkoutUrl,
  };
};

const getAppointments = async ({
  userId,
  filters,
}: {
  userId?: string;
  filters: IGetAppointmentsFilters;
}) => {
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelper.calculatePagination({
      page: filters.page,
      limit: filters.limit,
      sortBy: filters.sortBy || "startsAt",
      sortOrder: filters.sortOrder || "desc",
    });

  const { status } = filters;

  // TODO: startsAt & EndsAt filter set

  const where: Prisma.AppointmentWhereInput = {};
  const select: Prisma.AppointmentSelect = {
    id: true,
    startsAt: true,
    endsAt: true,
    status: true,
    patientId: true,
    doctorId: true,
    doctor: {
      select: {
        id: true,
        userId: true,
        specialties: true,
        department: { select: { name: true } },
        user: {
          select: { name: true, profileImage: true, email: true, phone: true },
        },
      },
    },
    patient: {
      select: {
        id: true,
        userId: true,
        bloodGroup: true,
        user: {
          select: { name: true, profileImage: true, email: true, phone: true },
        },
      },
    },
  };

  if (userId) {
    where.OR = [{ patientId: userId }, { doctorId: userId }];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (status && status.trim() !== "") where.status = status as any;

  const [data, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      select,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.appointment.count({ where }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformData = data.map((appointment: any) => {
    const { doctor, patient, ...rest } = appointment;

    return {
      ...rest,
      doctor: {
        id: doctor.id,
        userId: doctor.userId,
        name: doctor.user.name,
        profileImage: doctor.user.profileImage,
        email: doctor.user.email,
        phone: doctor.user.phone,
        specialties: doctor.specialties,
        departmentName: doctor.department?.name,
      },
      patient: {
        id: patient.id,
        userId: patient.userId,
        name: patient.user.name,
        profileImage: patient.user.profileImage,
        email: patient.user.email,
        phone: patient.user.phone,
        bloodGroup: patient.bloodGroup,
      },
    };
  });

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    data: transformData,
  };
};

const getAppointmentDetails = async (appointmentId: string) => {
  let appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      doctor: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              profileImage: true,
              gender: true,
              address: true,
            },
          },
          department: true,
        },
      },
      patient: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              profileImage: true,
              gender: true,
              address: true,
              dateOfBirth: true,
            },
          },
        },
      },
      consultation: {
        include: {
          prescriptions: true,
        },
      },
      payments: true,
    },
  });

  if (!appointment) {
    throw new AppError(404, "Invalid appointment ID");
  }

  // Auto-create consultation if it is CONFIRMED and has no consultation record yet
  if (appointment.status === "CONFIRMED" && !appointment.consultation) {
    await prisma.consultation.create({
      data: {
        appointmentId: appointment.id,
        status: "SCHEDULED",
      },
    });

    // Refetch the appointment with new consultation included
    appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        doctor: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                profileImage: true,
                gender: true,
                address: true,
              },
            },
            department: true,
          },
        },
        patient: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                profileImage: true,
                gender: true,
                address: true,
                dateOfBirth: true,
              },
            },
          },
        },
        consultation: {
          include: {
            prescriptions: true,
          },
        },
        payments: true,
      },
    });
  }

  return appointment;
};

const rescheduleAppointment = async (payload: {
  data: TRescheduleAppointment;
  appointmentId: string;
}) => {
  const { data, appointmentId } = payload;
  const startsAt = new Date(data.startsAt);

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (!appointment) {
    throw new AppError(400, "Invalid Appointment ID");
  }

  if (appointment.status !== "CONFIRMED") {
    throw new AppError(
      400,
      `${appointment.status.toLowerCase()} Appointment can't be reschedule`,
    );
  }

  // Get available slots for that day
  const slots = await doctorService.getDoctorAvailableSlots(
    appointment.doctorId,
    startsAt,
    1,
  );

  if (!slots.length) {
    throw new AppError(400, "Slot not available");
  }

  const daySlots: string[] = slots[0]?.slots ?? [];

  const hh = startsAt.getUTCHours().toString().padStart(2, "0");
  const mm = startsAt.getUTCMinutes().toString().padStart(2, "0");
  const hhmm = `${hh}:${mm}`;
  if (!daySlots.includes(hhmm)) {
    throw new AppError(400, "Slot not available");
  }

  // Calculate end time
  const endsAt = addMinutes(startsAt, slots[0]?.duration!);

  // Check for Conflicting Appointments for the Patient
  const patientConflict = await prisma.appointment.findFirst({
    where: {
      patientId: appointment.patientId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { gte: startsAt, lte: endsAt },
    },
  });

  if (patientConflict) {
    throw new AppError(400, "You already have an appointment at this time.");
  }

  const result = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      startsAt,
      endsAt,
    },
  });

  return result;
};

const cancelAppointment = async (payload: {
  appointmentId: string;
  data: TCancelAppointment;
  userRole: string;
}) => {
  const { appointmentId, data, userRole } = payload;
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { consultation: true },
  });

  if (!appointment) {
    throw new AppError(400, "Invalid Appointment ID");
  }

  if (appointment.status === "COMPLETED") {
    throw new AppError(400, "Completed appointment cannot be cancelled");
  }

  if (appointment.status === "CANCELLED") {
    throw new AppError(400, "Appointment is already cancelled");
  }

  // check start time
  const now = new Date();
  if (userRole === "PATIENT" && appointment.startsAt <= now) {
    throw new AppError(
      400,
      "Cannot cancel an appointment that has already started. Please contact support.",
    );
  }

  // find payment record
  const paymentRecord = await prisma.payment.findFirst({
    where: { appointmentId: appointment.id, status: "COMPLETED" },
  });

  let refundId: string | null = null;

  if (paymentRecord && paymentRecord.paymentIntentId) {
    // issue refund
    const refund = await paymentService.refundPayment(
      paymentRecord.id,
      paymentRecord.paymentIntentId,
    );
    refundId = refund.refundId;
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: "CANCELLED", cancelReason: data.cancelReason },
    });

    if (appointment.consultation) {
      await tx.consultation.update({
        where: { id: appointment.consultation.id },
        data: { status: "CANCELLED" },
      });
    }
  });

  return { appointmentId, refundId };
};

const deleteAppointment = async (appointmentId: string) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (!appointment) {
    throw new AppError(400, "Invalid Appointment ID");
  }

  if (appointment.status === "COMPLETED") {
    throw new AppError(400, "Completed appointment can't be delete");
  }

  if (appointment.status === "CONFIRMED") {
    throw new AppError(
      400,
      "Please Cancel the appointment, then delete appointment",
    );
  }

  await prisma.appointment.delete({
    where: { id: appointmentId },
  });

  return null;
};

export const appointmentService = {
  createAppointment,
  getAppointments,
  getAppointmentDetails,
  rescheduleAppointment,
  cancelAppointment,
  deleteAppointment,
};

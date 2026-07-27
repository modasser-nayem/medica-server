import { Prisma } from "@prisma/client";
import prisma from "../../../db/connector";
import AppError from "../../../errors/AppError";
import {
  TCreateAppointment,
  IGetAppointmentsFilters,
  TRescheduleAppointment,
  TCancelAppointment,
  TRequestReschedule,
  TRejectReschedule,
} from "./appointment.interface";
import { doctorService } from "../Doctor/doctor.service";
import { addMinutes, format } from "date-fns";
import { paginationHelper } from "../../../utils/pagination";
import { paymentService } from "../Payment/payment.service";
import { addDays } from "date-fns";

const evaluateAndAutoUpdateExpiredAppointments = async () => {
  const expiredAppointments = await prisma.appointment.findMany({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      endsAt: { lt: new Date() },
    },
    include: {
      patient: true,
      doctor: true,
      consultation: {
        include: {
          calls: true,
          messages: true,
        },
      },
    },
  });

  if (expiredAppointments.length === 0) return;

  for (const appt of expiredAppointments) {
    if (appt.status === "PENDING") {
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { status: "MISSED" },
      });
      continue;
    }

    let newStatus: Prisma.AppointmentUpdateInput["status"] = "MISSED";

    if (appt.consultation) {
      const hasSuccessfulCall = appt.consultation.calls.some(
        (c) => c.status === "ANSWERED" || c.status === "ENDED"
      );

      if (hasSuccessfulCall) {
        newStatus = "COMPLETED";
      } else {
        const validMessages = appt.consultation.messages.filter(
          (m) =>
            new Date(m.createdAt).getTime() >= new Date(appt.startsAt).getTime() &&
            new Date(m.createdAt).getTime() <= new Date(appt.endsAt).getTime()
        );

        const hasDoctorMessaged = validMessages.some(
          (m) => m.senderId === appt.doctor.userId
        );
        const hasPatientMessaged = validMessages.some(
          (m) => m.senderId === appt.patient.userId
        );

        if (hasDoctorMessaged && hasPatientMessaged) {
          newStatus = "COMPLETED";
        } else if (hasDoctorMessaged) {
          newStatus = "PATIENT_MISSED";
        } else if (hasPatientMessaged) {
          newStatus = "DOCTOR_MISSED";
        } else {
          newStatus = "MISSED";
        }
      }
    }

    await prisma.appointment.update({
      where: { id: appt.id },
      data: { status: newStatus },
    });

    if (appt.consultation) {
      await prisma.consultation.update({
        where: { id: appt.consultation.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { status: newStatus as any },
      });
    }
  }
};

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
  const currency = "USD";

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
    successUrl: data.successUrl,
    cancelUrl: data.cancelUrl,
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
    rescheduleRequests: {
      orderBy: { createdAt: "desc" },
    },
  };

  if (userId) {
    where.OR = [{ patientId: userId }, { doctorId: userId }];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (status && status.trim() !== "") where.status = status as any;

  // Lazily update past pending or confirmed appointments
  await evaluateAndAutoUpdateExpiredAppointments();

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
  // Lazily update first
  await evaluateAndAutoUpdateExpiredAppointments();

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
      rescheduleRequests: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!appointment) {
    throw new AppError(404, "Appointment not found");
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
        rescheduleRequests: {
          orderBy: { createdAt: "desc" },
        },
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

const requestReschedule = async ({
  appointmentId,
  userRole,
  data,
}: {
  appointmentId: string;
  userRole: string;
  data: TRequestReschedule;
}) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });
  if (!appointment) throw new AppError(404, "Appointment not found");
  if (appointment.startsAt < new Date())
    throw new AppError(400, "Cannot reschedule a past appointment");

  const existingPending = await prisma.rescheduleRequest.findFirst({
    where: { appointmentId, status: "PENDING" },
  });
  if (existingPending)
    throw new AppError(400, "A reschedule request is already pending");

  const suggestedTime = new Date(data.suggestedTime);
  const slots = await doctorService.getDoctorAvailableSlots(
    appointment.doctorId,
    suggestedTime,
    1,
  );

  const daySlots: string[] = slots[0]?.slots ?? [];
  if (
    !daySlots.includes(suggestedTime.toISOString()) &&
    !daySlots.includes(
      format(suggestedTime, "yyyy-MM-dd'T'HH:mm:ss.SSS") + "Z",
    )
  ) {
    throw new AppError(400, "The suggested time slot is not available");
  }

  const request = await prisma.rescheduleRequest.create({
    data: {
      appointmentId,
      requestedBy: userRole,
      suggestedTime,
      reason: data.reason,
    },
  });

  return request;
};

const approveReschedule = async ({
  appointmentId,
  requestId,
  userRole,
}: {
  appointmentId: string;
  requestId: string;
  userRole: string;
}) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });
  if (!appointment) throw new AppError(404, "Appointment not found");
  if (appointment.startsAt < new Date())
    throw new AppError(400, "Cannot reschedule a past appointment");

  const request = await prisma.rescheduleRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) throw new AppError(404, "Request not found");
  if (request.status !== "PENDING")
    throw new AppError(400, "Request is not pending");
  if (request.requestedBy === userRole)
    throw new AppError(400, "You cannot approve your own request");

  const suggestedTime = request.suggestedTime;
  const slots = await doctorService.getDoctorAvailableSlots(
    appointment.doctorId,
    suggestedTime,
    1,
  );

  const daySlots: string[] = slots[0]?.slots ?? [];
  if (
    !daySlots.includes(suggestedTime.toISOString()) &&
    !daySlots.includes(
      format(suggestedTime, "yyyy-MM-dd'T'HH:mm:ss.SSS") + "Z",
    )
  ) {
    throw new AppError(
      400,
      "This slot has been booked by someone else in the meantime. Please reject this request and suggest a new time.",
    );
  }

  const durationMs =
    appointment.endsAt.getTime() - appointment.startsAt.getTime();
  const endsAt = new Date(suggestedTime.getTime() + durationMs);

  await prisma.$transaction(async (tx) => {
    await tx.rescheduleRequest.update({
      where: { id: requestId },
      data: { status: "APPROVED" },
    });
    await tx.appointment.update({
      where: { id: appointmentId },
      data: { startsAt: suggestedTime, endsAt },
    });
  });

  return { message: "Reschedule approved and appointment updated" };
};

const rejectReschedule = async ({
  appointmentId,
  requestId,
  userRole,
  data,
}: {
  appointmentId: string;
  requestId: string;
  userRole: string;
  data: TRejectReschedule;
}) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });
  if (!appointment) throw new AppError(404, "Appointment not found");
  if (appointment.startsAt < new Date())
    throw new AppError(400, "Cannot reschedule a past appointment");

  const request = await prisma.rescheduleRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) throw new AppError(404, "Request not found");
  if (request.status !== "PENDING")
    throw new AppError(400, "Request is not pending");
  if (request.requestedBy === userRole)
    throw new AppError(400, "You cannot reject your own request");

  await prisma.$transaction(async (tx) => {
    await tx.rescheduleRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED", rejectReason: data.rejectReason },
    });

    if (data.newSuggestedTime) {
      const suggestedTime = new Date(data.newSuggestedTime);
      
      const slots = await doctorService.getDoctorAvailableSlots(
        appointment.doctorId,
        suggestedTime,
        1,
      );

      const daySlots: string[] = slots[0]?.slots ?? [];
      if (
        !daySlots.includes(suggestedTime.toISOString()) &&
        !daySlots.includes(
          format(suggestedTime, "yyyy-MM-dd'T'HH:mm:ss.SSS") + "Z",
        )
      ) {
        throw new AppError(400, "The suggested counter time slot is not available");
      }

      await tx.rescheduleRequest.create({
        data: {
          appointmentId,
          requestedBy: userRole,
          suggestedTime,
          reason:
            data.rejectReason ||
            "Suggested a new time after rejecting the previous one.",
        },
      });
    }
  });

  return { message: "Reschedule rejected" };
};

export const appointmentService = {
  createAppointment,
  getAppointments,
  getAppointmentDetails,
  rescheduleAppointment,
  cancelAppointment,
  deleteAppointment,
  requestReschedule,
  approveReschedule,
  rejectReschedule,
};

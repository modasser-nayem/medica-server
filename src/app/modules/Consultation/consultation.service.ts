import { CallType, CallStatus, ConsultationStatus } from "@prisma/client";
import { RtcTokenBuilder, RtcRole } from "agora-token";
import prisma from "../../../db/connector";
import AppError from "../../../errors/AppError";
import { socketManager } from "../../../socket";
import { paymentService } from "../Payment/payment.service";
import config from "../../../config";
import { randomUUID } from "crypto";

const AGORA_TOKEN_EXPIRY_SECONDS = 3600;

// generate Agora token
const generateAgoraToken = (channelName: string, userAccount: string): string => {
  const { APP_ID, APP_CERTIFICATE } = config.agora;
  const currentTime = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTime + AGORA_TOKEN_EXPIRY_SECONDS;

  return RtcTokenBuilder.buildTokenWithUserAccount(
    APP_ID,
    APP_CERTIFICATE,
    channelName,
    userAccount,
    RtcRole.PUBLISHER,
    privilegeExpiredTs,
    privilegeExpiredTs,
  );
};

// initiate call
const initiateCall = async (payload: {
  appointmentId: string;
  type: "VOICE" | "VIDEO";
  userId: string;
  userProfileId: string;
}) => {
  const { appointmentId, type, userId, userProfileId } = payload;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      consultation: true,
      patient: { include: { user: true } },
      doctor: { include: { user: true } },
    },
  });

  if (!appointment) {
    throw new AppError(404, "Appointment not found");
  }

  // check permissions
  if (appointment.patientId !== userProfileId && appointment.doctorId !== userProfileId) {
    throw new AppError(403, "You do not have permission to initiate a call for this appointment");
  }

  // enforce slot timing
  const now = new Date();
  if (appointment.status !== "CONFIRMED" || appointment.startsAt > now || appointment.endsAt < now) {
    throw new AppError(
      400,
      "Calling is only allowed during the active booked appointment time slot.",
    );
  }

  const consultation = await prisma.consultation.upsert({
    where: { appointmentId },
    update: {
      status: "IN_PROGRESS",
    },
    create: {
      appointmentId,
      status: "IN_PROGRESS",
      startedAt: now,
    },
  });

  const roomId = randomUUID();

  // save call record
  const call = await prisma.call.create({
    data: {
      consultationId: consultation.id,
      type: type as CallType,
      status: "INITIATED" as CallStatus,
      roomId,
      startedAt: now,
    },
  });

  await prisma.consultation.update({
    where: { id: consultation.id },
    data: { roomId },
  });

  // tokens for agora
  const callerToken = generateAgoraToken(roomId, userProfileId);

  const isCallerPatient = appointment.patientId === userProfileId;
  const recipientUserId = isCallerPatient
    ? appointment.doctor.userId
    : appointment.patient.userId;
  const recipientProfileId = isCallerPatient ? appointment.doctorId : appointment.patientId;

  const recipientToken = generateAgoraToken(roomId, recipientProfileId);

  // notify recipient via socket
  if (socketManager.io) {
    const callerName = isCallerPatient
      ? appointment.patient.user.name
      : appointment.doctor.user.name;

    socketManager.io.to(recipientUserId).emit("incoming_call", {
      callId: call.id,
      appointmentId,
      type,
      roomId,
      agoraToken: recipientToken,
      agoraAppId: config.agora.APP_ID,
      caller: {
        userId,
        profileId: userProfileId,
        name: callerName,
      },
    });
  }

  return {
    callId: call.id,
    roomId,
    type: call.type,
    status: call.status,
    agoraToken: callerToken,
    agoraAppId: config.agora.APP_ID,
  };
};

// get token
const getAgoraToken = async (payload: { callId: string; userProfileId: string }) => {
  const { callId, userProfileId } = payload;

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      consultation: {
        include: { appointment: true },
      },
    },
  });

  if (!call) {
    throw new AppError(404, "Call not found");
  }

  const { appointment } = call.consultation;

  if (appointment.patientId !== userProfileId && appointment.doctorId !== userProfileId) {
    throw new AppError(403, "Access denied");
  }

  // enforce slot timing
  const now = new Date();
  if (appointment.endsAt < now) {
    throw new AppError(400, "This call session has ended because the appointment time slot has expired.");
  }

  if (!call.roomId) {
    throw new AppError(400, "No room ID assigned to this call");
  }

  const token = generateAgoraToken(call.roomId, userProfileId);

  return {
    callId: call.id,
    roomId: call.roomId,
    agoraToken: token,
    agoraAppId: config.agora.APP_ID,
  };
};

// get details
const getCallDetails = async (callId: string, userProfileId: string) => {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      consultation: {
        include: {
          appointment: true,
        },
      },
    },
  });

  if (!call) {
    throw new AppError(404, "Call session not found");
  }

  const appointment = call.consultation.appointment;

  if (appointment.patientId !== userProfileId && appointment.doctorId !== userProfileId) {
    throw new AppError(403, "Access denied");
  }

  const now = new Date();
  if (appointment.endsAt < now) {
    throw new AppError(400, "This call session has ended because the appointment time slot has expired.");
  }

  return call;
};

// end call
const endCall = async (callId: string, userProfileId: string) => {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      consultation: {
        include: {
          appointment: {
            include: {
              patient: { include: { user: true } },
              doctor: { include: { user: true } },
            },
          },
        },
      },
    },
  });

  if (!call) {
    throw new AppError(404, "Call not found");
  }

  const { appointment } = call.consultation;

  if (appointment.patientId !== userProfileId && appointment.doctorId !== userProfileId) {
    throw new AppError(403, "Access denied");
  }

  const now = new Date();

  // update call and consultation statuses
  const updatedCall = await prisma.call.update({
    where: { id: callId },
    data: {
      status: "ENDED" as CallStatus,
      endedAt: now,
    },
  });

  await prisma.consultation.update({
    where: { id: call.consultationId },
    data: {
      status: "COMPLETED" as ConsultationStatus,
      endedAt: now,
    },
  });

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "COMPLETED" },
  });

  // release payout from escrow
  await paymentService.releasePayoutToDoctor(appointment.id);

  // notify via socket
  if (socketManager.io) {
    const patientUserId = appointment.patient.userId;
    const doctorUserId = appointment.doctor.userId;

    socketManager.io.to(patientUserId).emit("call_ended", {
      callId: call.id,
      roomId: call.roomId,
    });
    socketManager.io.to(doctorUserId).emit("call_ended", {
      callId: call.id,
      roomId: call.roomId,
    });
  }

  return updatedCall;
};

// manually complete consultation
const completeConsultation = async (appointmentId: string, doctorProfileId: string) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      consultation: true,
      patient: { include: { user: true } },
      doctor: { include: { user: true } },
    },
  });

  if (!appointment) {
    throw new AppError(404, "Appointment not found");
  }

  if (appointment.doctorId !== doctorProfileId) {
    throw new AppError(403, "You do not have permission to complete this consultation");
  }

  const now = new Date();

  const consultation = await prisma.consultation.upsert({
    where: { appointmentId },
    update: {
      status: "COMPLETED" as ConsultationStatus,
      endedAt: now,
    },
    create: {
      appointmentId,
      status: "COMPLETED" as ConsultationStatus,
      startedAt: now,
      endedAt: now,
    },
  });

  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "COMPLETED" },
  });

  // release payout
  try {
    await paymentService.releasePayoutToDoctor(appointmentId);
  } catch (err) {
    console.error("Failed to release payout during manual complete:", err);
  }

  // notify via socket
  if (socketManager.io) {
    const patientUserId = appointment.patient.userId;
    const doctorUserId = appointment.doctor.userId;

    socketManager.io.to(patientUserId).emit("consultation_completed", {
      appointmentId,
      consultationId: consultation.id,
    });
    socketManager.io.to(doctorUserId).emit("consultation_completed", {
      appointmentId,
      consultationId: consultation.id,
    });
  }

  return { consultation, appointment: updatedAppointment };
};

export const consultationService = {
  initiateCall,
  getAgoraToken,
  getCallDetails,
  endCall,
  completeConsultation,
};

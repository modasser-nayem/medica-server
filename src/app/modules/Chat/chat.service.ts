import { Prisma } from "@prisma/client";
import prisma from "../../../db/connector";
import AppError from "../../../errors/AppError";
import { socketManager } from "../../../socket";

const sendMessage = async (payload: {
  senderId: string;
  senderRole: string;
  senderProfileId: string;
  recipientId: string;
  text?: string;
  attachment?: string;
  attachments?: string[];
  attachmentType?: string;
  replyToId?: string;
}) => {
  const {
    senderId,
    senderRole,
    senderProfileId,
    recipientId,
    text,
    attachment,
    attachments,
    attachmentType,
    replyToId,
  } = payload;

  // Find recipient user
  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    include: {
      patientProfile: true,
      doctorProfile: true,
    },
  });

  if (!recipient) {
    throw new AppError(404, "Recipient not found");
  }

  let patientId = "";
  let doctorId = "";

  if (senderRole === "PATIENT") {
    patientId = senderProfileId;
    if (!recipient.doctorProfile) {
      throw new AppError(400, "Recipient must be a doctor");
    }
    doctorId = recipient.doctorProfile.id;
  } else if (senderRole === "DOCTOR") {
    doctorId = senderProfileId;
    if (!recipient.patientProfile) {
      throw new AppError(400, "Recipient must be a patient");
    }
    patientId = recipient.patientProfile.id;
  } else {
    throw new AppError(400, "Invalid sender role");
  }

  // Check if there is a confirmed appointment right now
  const now = new Date();
  const activeApt = await prisma.appointment.findFirst({
    where: {
      patientId,
      doctorId,
      status: "CONFIRMED",
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    include: {
      consultation: true,
    },
  });

  if (!activeApt) {
    throw new AppError(
      400,
      "Messaging is only allowed during your active booked appointment time slot.",
    );
  }

  // Find or create ChatThread
  const thread = await prisma.chatThread.upsert({
    where: {
      patientId_doctorId: {
        patientId,
        doctorId,
      },
    },
    update: {},
    create: {
      patientId,
      doctorId,
    },
  });

  // Create message
  const message = await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      senderId,
      consultationId: activeApt.consultation?.id || null,
      text,
      attachment,
      attachments: attachments || (attachment ? [attachment] : []),
      // Map attachmentType string to MessageType enum; default to TEXT
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: (attachmentType as any) || (attachment ? "FILE" : "TEXT"),
      replyToId,
    },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          profileImage: true,
        },
      },
      replyTo: true,
    },
  });

  // Emit real-time message to socket room
  if (socketManager.io) {
    socketManager.io.to(thread.id).emit("new_message", message);
  }

  return message;
};

const getThreads = async (payload: {
  userId: string;
  role: string;
  profileId: string;
}) => {
  const { role, profileId } = payload;

  const where: Prisma.ChatThreadWhereInput = {};
  if (role === "PATIENT") {
    where.patientId = profileId;
  } else if (role === "DOCTOR") {
    where.doctorId = profileId;
  } else {
    throw new AppError(400, "Invalid role");
  }

  // Auto-ensure chat threads exist for any confirmed appointments
  const confirmedAppointments = await prisma.appointment.findMany({
    where: {
      patientId: role === "PATIENT" ? profileId : undefined,
      doctorId: role === "DOCTOR" ? profileId : undefined,
      status: "CONFIRMED",
    },
  });

  for (const appointment of confirmedAppointments) {
    await prisma.chatThread.upsert({
      where: {
        patientId_doctorId: {
          patientId: appointment.patientId,
          doctorId: appointment.doctorId,
        },
      },
      update: {},
      create: {
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
      },
    });
  }

  const threads = await prisma.chatThread.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              profileImage: true,
            },
          },
        },
      },
    },
  });

  // Check which threads are currently active
  const now = new Date();
  const enrichedThreads = await Promise.all(
    threads.map(async (thread) => {
      const activeApt = await prisma.appointment.findFirst({
        where: {
          patientId: thread.patientId,
          doctorId: thread.doctorId,
          status: "CONFIRMED",
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
      });

      // Get recipient info
      let recipientName = "";
      let recipientImage = "";
      let recipientUserId = "";

      if (role === "PATIENT") {
        const doc = await prisma.doctor.findUnique({
          where: { id: thread.doctorId },
          include: { user: true },
        });
        if (doc) {
          recipientName = doc.user.name;
          recipientImage = doc.user.profileImage || "";
          recipientUserId = doc.user.id;
        }
      } else {
        const pat = await prisma.patient.findUnique({
          where: { id: thread.patientId },
          include: { user: true },
        });
        if (pat) {
          recipientName = pat.user.name;
          recipientImage = pat.user.profileImage || "";
          recipientUserId = pat.user.id;
        }
      }

      // Check online/presence status
      const isOnline = socketManager.isUserOnline(recipientUserId);

      return {
        id: thread.id,
        patientId: thread.patientId,
        doctorId: thread.doctorId,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        lastMessage: thread.messages[0] || null,
        isActive: !!activeApt,
        recipient: {
          id: recipientUserId,
          name: recipientName,
          profileImage: recipientImage,
          isOnline,
        },
      };
    }),
  );

  return enrichedThreads;
};

const getThreadMessages = async (threadId: string) => {
  const messages = await prisma.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          profileImage: true,
        },
      },
      replyTo: true,
    },
  });

  return messages;
};

const markAsRead = async (threadId: string, userId: string) => {
  await prisma.chatMessage.updateMany({
    where: {
      threadId,
      senderId: { not: userId },
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });

  // Notify real-time users in thread channel
  if (socketManager.io) {
    socketManager.io
      .to(threadId)
      .emit("messages_seen", { threadId, readerId: userId });
  }

  return { success: true };
};

export const chatService = {
  sendMessage,
  getThreads,
  getThreadMessages,
  markAsRead,
};

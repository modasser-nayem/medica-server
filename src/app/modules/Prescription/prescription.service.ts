import prisma from "../../../db/connector";
import AppError from "../../../errors/AppError";
import { paymentService } from "../Payment/payment.service";

const createPrescription = async (doctorProfileId: string, data: any) => {
  const consultation = await prisma.consultation.findUnique({
    where: { id: data.consultationId },
    include: { appointment: true },
  });

  if (!consultation) {
    throw new AppError(404, "Consultation not found");
  }

  if (consultation.appointment.doctorId !== doctorProfileId) {
    throw new AppError(403, "You do not have permission to write a prescription for this appointment");
  }

  const result = await prisma.prescription.create({
    data: {
      consultationId: data.consultationId,
      medicines: data.medicines,
      instructions: data.instructions,
      diagnosis: data.diagnosis,
      nextVisit: data.nextVisit ? new Date(data.nextVisit) : null,
    },
  });

  // Automatically complete consultation and appointment if not already completed
  if (consultation.appointment.status !== "COMPLETED") {
    await prisma.consultation.update({
      where: { id: data.consultationId },
      data: { status: "COMPLETED", endedAt: new Date() },
    });

    await prisma.appointment.update({
      where: { id: consultation.appointmentId },
      data: { status: "COMPLETED" },
    });

    // Release escrow payout to doctor
    try {
      await paymentService.releasePayoutToDoctor(consultation.appointmentId);
    } catch (err) {
      // Log error but do not fail prescription creation
      console.error("Failed to release payout to doctor:", err);
    }
  }

  return result;
};

const getPrescriptionById = async (prescriptionId: string, profileId: string) => {
  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: {
      consultation: {
        include: {
          appointment: {
            include: {
              doctor: { include: { user: { select: { name: true, profileImage: true } } } },
              patient: { include: { user: { select: { name: true, profileImage: true } } } },
            },
          },
        },
      },
    },
  });

  if (!prescription) {
    throw new AppError(404, "Prescription not found");
  }

  const appointment = prescription.consultation.appointment;
  if (appointment.patientId !== profileId && appointment.doctorId !== profileId) {
    throw new AppError(403, "Access denied to this prescription");
  }

  return prescription;
};

const getPatientPrescriptions = async (patientProfileId: string, profileId: string) => {
  // A patient can see their own prescriptions, a doctor can see patient's prescriptions if they have/had appointments
  const prescriptions = await prisma.prescription.findMany({
    where: {
      consultation: {
        appointment: {
          patientId: patientProfileId,
        },
      },
    },
    include: {
      consultation: {
        include: {
          appointment: {
            include: {
              doctor: {
                include: {
                  user: {
                    select: {
                      name: true,
                      profileImage: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return prescriptions;
};

export const prescriptionService = {
  createPrescription,
  getPrescriptionById,
  getPatientPrescriptions,
};

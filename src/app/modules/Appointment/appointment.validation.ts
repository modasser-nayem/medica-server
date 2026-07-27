import { z } from "zod";

const createAppointment = z.object({
  body: z
    .object({
      patientId: z.string().uuid("Invalid patient ID"),
      doctorId: z.string().uuid("Invalid doctor ID"),
      startsAt: z.string().datetime(),
      successUrl: z.string().min(1, "successUrl is required"),
      cancelUrl: z.string().min(1, "cancelUrl is required"),
    })
    .refine((data) => new Date(data.startsAt).getTime() > Date.now(), {
      message: "Start time must be in the future (UTC)",
      path: ["startsAt"],
    }),
});

const rescheduleAppointment = z.object({
  body: z
    .object({
      startsAt: z.string().datetime(),
    })
    .refine((data) => new Date(data.startsAt).getTime() > Date.now(), {
      message: "Start time must be in the future (UTC)",
      path: ["startsAt"],
    }),
});

const cancelAppointment = z.object({
  body: z.object({
    cancelReason: z
      .string({ required_error: "cancelReason is required" })
      .min(5, { message: "cancel reason min 5 characters" }),
  }),
});

const requestReschedule = z.object({
  body: z.object({
    suggestedTime: z.string().datetime(),
    reason: z.string().optional(),
  }),
});

const rejectReschedule = z.object({
  body: z.object({
    rejectReason: z.string().optional(),
    newSuggestedTime: z.string().datetime().optional(),
  }),
});

export const appointmentSchemaValidation = {
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  requestReschedule,
  rejectReschedule,
};

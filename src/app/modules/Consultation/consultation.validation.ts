import { z } from "zod";

const initiateCall = z.object({
  body: z.object({
    appointmentId: z.string({
      required_error: "Appointment ID is required",
    }),
    type: z.enum(["VOICE", "VIDEO"], {
      required_error: "Call type must be VOICE or VIDEO",
    }),
  }),
});

export const consultationValidation = {
  initiateCall,
};

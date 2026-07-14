import { z } from "zod";

const createPrescription = z.object({
  body: z.object({
    consultationId: z.string().uuid("Invalid consultation ID"),
    medicines: z
      .array(
        z.object({
          name: z.string().min(1, "Medicine name is required"),
          dose: z.string().min(1, "Dose is required"),
          frequency: z.string().min(1, "Frequency is required"),
          duration: z.string().min(1, "Duration is required"),
          notes: z.string().optional(),
        }),
      )
      .optional(),
    instructions: z
      .string()
      .min(3, "Instructions must be at least 3 characters"),
    diagnosis: z.string().optional(),
    nextVisit: z.string().datetime().optional().nullable(),
  }),
});

export const prescriptionSchemaValidation = {
  createPrescription,
};

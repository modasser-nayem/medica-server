import { z } from "zod";

const repayment = z.object({
  body: z.object({
    appointmentId: z
      .string({ required_error: "appointmentId is required" })
      .uuid()
      .nonempty("appointmentId is required"),
  }),
});

const retryPaymentProcess = z.object({
  body: z.object({
    sessionId: z
      .string({ required_error: "sessionId is required" })
      .nonempty("sessionId is required"),
  }),
});

export const paymentSchemaValidation = { repayment, retryPaymentProcess };

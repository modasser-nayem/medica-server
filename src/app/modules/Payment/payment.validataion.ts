import { z } from "zod";

// Patient creates a checkout session for an appointment
const createCheckoutSession = z.object({
  body: z.object({
    appointmentId: z.string({ required_error: "appointmentId is required" }).uuid(),
  }),
});

// Manual status check / retry after redirect
const verifyPayment = z.object({
  params: z.object({
    sessionId: z.string({ required_error: "sessionId is required" }).nonempty(),
  }),
});

// Retry payment for a failed appointment
const retryPayment = z.object({
  body: z.object({
    appointmentId: z.string({ required_error: "appointmentId is required" }).uuid(),
    successUrl: z.string().min(1, "successUrl is required"),
    cancelUrl: z.string().min(1, "cancelUrl is required"),
  }),
});

// Doctor card withdrawal
const withdrawToCard = z.object({
  body: z.object({
    amount: z
      .number({ required_error: "amount is required" })
      .positive("amount must be greater than zero"),
    cardBrand: z
      .string({ required_error: "cardBrand is required" })
      .nonempty("cardBrand is required"),
    cardLast4: z
      .string({ required_error: "cardLast4 is required" })
      .length(4, "cardLast4 must be exactly 4 digits")
      .regex(/^\d{4}$/, "cardLast4 must contain only digits"),
    cardHolderName: z
      .string({ required_error: "cardHolderName is required" })
      .nonempty("cardHolderName is required"),
  }),
});

export const paymentValidation = {
  createCheckoutSession,
  verifyPayment,
  retryPayment,
  withdrawToCard,
};

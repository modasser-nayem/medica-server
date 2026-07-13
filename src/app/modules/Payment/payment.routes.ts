import express from "express";
import { authorize } from "../../middlewares/authorize";
import { paymentController } from "./payment.controller";
import requestValidate from "../../middlewares/requestValidation";
import { paymentSchemaValidation } from "./payment.validataion";

const router = express.Router();

// ── Payment flow ──────────────────────────────────────────────────────────────

// POST /payments/success/:sessionId — called by frontend after checkout redirect
router.post("/success/:sessionId", paymentController.successPaymentHandler);

// POST /payments/retry — manually verify a session status (fallback)
router.post(
  "/retry",
  authorize(),
  requestValidate(paymentSchemaValidation.retryPaymentProcess),
  paymentController.retryPaymentProcess,
);

// POST /payments/repayment — create a new checkout session for a failed payment
router.post(
  "/repayment",
  authorize(),
  requestValidate(paymentSchemaValidation.repayment),
  paymentController.rePayment,
);

// ── Admin: Payments ───────────────────────────────────────────────────────────

// GET /payments — list payments (admin sees all, doctor/patient see own)
router.get("/", authorize("ADMIN", "DOCTOR", "PATIENT"), paymentController.getPayments);

// ── Admin: No-Show ────────────────────────────────────────────────────────────

// POST /payments/no-show/:appointmentId — doctor missed slot → full patient refund
router.post(
  "/no-show/:appointmentId",
  authorize("ADMIN"),
  paymentController.handleDoctorNoShow,
);

// ── Payouts ───────────────────────────────────────────────────────────────────

// GET /payments/payouts — list payouts (admin sees all, doctor sees own)
router.get(
  "/payouts",
  authorize("ADMIN", "DOCTOR"),
  paymentController.getPayouts,
);

// PATCH /payments/payouts/:payoutId/paid — admin marks manual bank transfer as done
router.patch(
  "/payouts/:payoutId/paid",
  authorize("ADMIN"),
  paymentController.markPayoutAsPaid,
);

// ── Stripe Connect (Doctor Bank Account) ──────────────────────────────────────────

// GET /payments/connect/status — check if this doctor has a Stripe Connect account
router.get(
  "/connect/status",
  authorize("DOCTOR"),
  paymentController.getStripeConnectStatus,
);

// POST /payments/connect/onboard — generate/refresh Stripe Connect onboarding URL
router.post(
  "/connect/onboard",
  authorize("DOCTOR"),
  paymentController.createStripeConnectOnboarding,
);

// POST /payments/payouts/:payoutId/withdraw — doctor self-service withdrawal
router.post(
  "/payouts/:payoutId/withdraw",
  authorize("DOCTOR"),
  paymentController.withdrawPayout,
);

export const paymentRoutes = router;

// Stripe webhook handler (registered separately in app.ts with raw body)
export const stripeWebhookHandler = paymentController.handleStripeWebhook;

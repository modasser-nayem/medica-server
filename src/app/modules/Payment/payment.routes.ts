import express from "express";
import { authorize } from "../../middlewares/authorize";
import { paymentController } from "./payment.controller";
import requestValidate from "../../middlewares/requestValidation";
import { paymentSchemaValidation } from "./payment.validataion";

const router = express.Router();

// Success redirect after Stripe checkout
router.post("/success/:sessionId", paymentController.successPaymentHandler);

// Manual status check fallback
router.post(
  "/retry",
  authorize(),
  requestValidate(paymentSchemaValidation.retryPaymentProcess),
  paymentController.retryPaymentProcess,
);

// Create new checkout session for failed appointment payment
router.post(
  "/repayment",
  authorize(),
  requestValidate(paymentSchemaValidation.repayment),
  paymentController.rePayment,
);

// List payment history
router.get("/", authorize("ADMIN", "DOCTOR", "PATIENT"), paymentController.getPayments);

// Process refund if doctor didn't show up
router.post(
  "/no-show/:appointmentId",
  authorize("ADMIN"),
  paymentController.handleDoctorNoShow,
);

// List doctor payouts
router.get(
  "/payouts",
  authorize("ADMIN", "DOCTOR"),
  paymentController.getPayouts,
);

// Mark manual bank transfer payout as paid
router.patch(
  "/payouts/:payoutId/paid",
  authorize("ADMIN"),
  paymentController.markPayoutAsPaid,
);

// Check Stripe Connect status for doctor
router.get(
  "/connect/status",
  authorize("DOCTOR"),
  paymentController.getStripeConnectStatus,
);

// Get Stripe Connect onboarding link
router.post(
  "/connect/onboard",
  authorize("DOCTOR"),
  paymentController.createStripeConnectOnboarding,
);

// Doctor self-service withdrawal
router.post(
  "/payouts/:payoutId/withdraw",
  authorize("DOCTOR"),
  paymentController.withdrawPayout,
);

export const paymentRoutes = router;

// Webhook handler used in main app.ts
export const stripeWebhookHandler = paymentController.handleStripeWebhook;

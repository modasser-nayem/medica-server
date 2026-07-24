import express from "express";
import { authorize } from "../../middlewares/authorize";
import { paymentController } from "./payment.controller";
import requestValidate from "../../middlewares/requestValidation";
import { paymentValidation } from "./payment.validataion";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT CHECKOUT
// ─────────────────────────────────────────────────────────────────────────────

// Verify payment after Stripe redirect (must be authenticated — prevents session snooping)
router.post(
  "/verify/:sessionId",
  authorize("PATIENT"),
  requestValidate(paymentValidation.verifyPayment),
  paymentController.verifyPayment,
);

// Retry payment for a failed appointment — patient only
router.post(
  "/retry",
  authorize("PATIENT"),
  requestValidate(paymentValidation.retryPayment),
  paymentController.retryPayment,
);

// Full payment history — admin: all; doctor: own; patient: own
router.get(
  "/",
  authorize("ADMIN", "DOCTOR", "PATIENT"),
  paymentController.getPayments,
);

// ─────────────────────────────────────────────────────────────────────────────
// ESCROW PAYOUTS (Admin only — per-appointment escrow ledger with commission split)
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/escrow",
  authorize("ADMIN"),
  paymentController.getEscrowPayouts,
);

// Record doctor no-show and auto-refund patient
router.post(
  "/no-show/:appointmentId",
  authorize("ADMIN"),
  paymentController.handleDoctorNoShow,
);

// ─────────────────────────────────────────────────────────────────────────────
// DOCTOR WALLET & WITHDRAWALS
// ─────────────────────────────────────────────────────────────────────────────

// Get doctor wallet balance, upcoming earnings, and totals
router.get(
  "/wallet",
  authorize("DOCTOR"),
  paymentController.getDoctorWallet,
);

// Instant card withdrawal — doctor only
router.post(
  "/withdraw",
  authorize("DOCTOR"),
  requestValidate(paymentValidation.withdrawToCard),
  paymentController.withdrawToCard,
);

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION & WITHDRAWAL HISTORY
// ─────────────────────────────────────────────────────────────────────────────

// Transaction ledger
// - Patient: sees own payment/refund transactions
// - Doctor: sees own earning/withdrawal transactions
// - Admin: sees all (filter by ?userId= or ?type= or date range)
router.get(
  "/transactions",
  authorize("ADMIN", "DOCTOR", "PATIENT"),
  paymentController.getTransactions,
);

// Card withdrawal records
// - Doctor: sees own withdrawals
// - Admin: sees all (filter by ?doctorId=)
router.get(
  "/withdrawals",
  authorize("ADMIN", "DOCTOR"),
  paymentController.getWithdrawals,
);

// ─────────────────────────────────────────────────────────────────────────────

export const paymentRoutes = router;

// Stripe webhook handler is mounted separately in app.ts with raw body parser
export const stripeWebhookHandler = paymentController.handleStripeWebhook;

import { asyncHandler } from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { paymentService } from "./payment.service";

// ── Stripe Webhook ────────────────────────────────────────────────────────────
const handleStripeWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers["stripe-signature"]!;
  await paymentService.handleStripeWebhook({ sig, body: req.body });
  res.json({ received: true });
});

// ── Payment Success Redirect ──────────────────────────────────────────────────
const successPaymentHandler = asyncHandler(async (req, res) => {
  const result = await paymentService.successPaymentHandler(req.params.sessionId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payment processed successfully",
    data: result,
  });
});

// ── List Payments ─────────────────────────────────────────────────────────────
const getPayments = asyncHandler(async (req, res) => {
  const filters: any = { ...req.query };

  if (req.user.role === "PATIENT") {
    filters.patientId = req.user.profileId;
  } else if (req.user.role === "DOCTOR") {
    filters.doctorId = req.user.profileId;
  }

  const result = await paymentService.getPayments({ filters });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payments retrieved successfully",
    data: result.data,
    pagination: result.pagination,
  });
});

// ── Retry Payment Process ─────────────────────────────────────────────────────
const retryPaymentProcess = asyncHandler(async (req, res) => {
  const result = await paymentService.retryPaymentProcess({
    sessionId: req.body.sessionId,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payment status checked successfully",
    data: result,
  });
});

// ── Re-initiate Payment for Failed Appointment ───────────────────────────────
const rePayment = asyncHandler(async (req, res) => {
  const result = await paymentService.repayment({
    appointmentId: req.body.appointmentId,
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "New checkout session created",
    data: result,
  });
});

// ── Doctor No-Show: Admin Triggers Full Refund ────────────────────────────────
const handleDoctorNoShow = asyncHandler(async (req, res) => {
  const result = await paymentService.handleDoctorNoShow(req.params.appointmentId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Doctor no-show recorded and patient refunded",
    data: result,
  });
});

// ── List Doctor Payouts ───────────────────────────────────────────────────────
const getPayouts = asyncHandler(async (req, res) => {
  const { status, page, limit } = req.query as Record<string, string>;
  let doctorId = req.query.doctorId as string | undefined;

  if (req.user.role === "DOCTOR") {
    doctorId = req.user.profileId;
  }

  const result = await paymentService.getPayouts({
    doctorId,
    status,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payouts retrieved successfully",
    data: result.data,
    pagination: result.pagination,
  });
});

// ── Admin: Mark Payout as Paid ────────────────────────────────────────────────
const markPayoutAsPaid = asyncHandler(async (req, res) => {
  const result = await paymentService.markPayoutAsPaid(req.params.payoutId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payout marked as paid",
    data: result,
  });
});

// ── Stripe Connect ──────────────────────────────────────────────────────────────────────

// GET /payments/connect/status — check if this doctor already has a Connect account
const getStripeConnectStatus = asyncHandler(async (req, res) => {
  const result = await paymentService.getStripeConnectStatus(req.user.userId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Stripe Connect status retrieved",
    data: result,
  });
});

// POST /payments/connect/onboard — start or resume Stripe Connect onboarding
const createStripeConnectOnboarding = asyncHandler(async (req, res) => {
  const { returnUrl, refreshUrl } = req.body as { returnUrl: string; refreshUrl: string };

  const result = await paymentService.createStripeConnectOnboardingLink({
    userId: req.user.userId,
    returnUrl: returnUrl || `${process.env.FRONTEND_URL}/dashboard/doctor/payouts?connect=success`,
    refreshUrl: refreshUrl || `${process.env.FRONTEND_URL}/dashboard/doctor/payouts?connect=refresh`,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Stripe Connect onboarding link created",
    data: result,
  });
});

// POST /payments/payouts/:payoutId/withdraw — doctor requests withdrawal for an ELIGIBLE payout
const withdrawPayout = asyncHandler(async (req, res) => {
  const { payoutId } = req.params;
  const result = await paymentService.withdrawPayout({
    payoutId,
    userId: req.user.userId,
  });

  // needsConnect=true means frontend should redirect to connect flow
  sendResponse(res, {
    statusCode: result.needsConnect ? 402 : 200,
    success: true,
    message: result.needsConnect
      ? "Bank account not connected. Please complete Stripe Connect onboarding first."
      : "Withdrawal initiated successfully",
    data: result,
  });
});

export const paymentController = {
  handleStripeWebhook,
  successPaymentHandler,
  getPayments,
  retryPaymentProcess,
  rePayment,
  handleDoctorNoShow,
  getPayouts,
  markPayoutAsPaid,
  getStripeConnectStatus,
  createStripeConnectOnboarding,
  withdrawPayout,
};

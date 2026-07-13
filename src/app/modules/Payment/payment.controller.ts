import { asyncHandler } from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { paymentService } from "./payment.service";

// Stripe webhook handler
const handleStripeWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers["stripe-signature"]!;
  await paymentService.handleStripeWebhook({ sig, body: req.body });
  res.json({ received: true });
});

// Success redirect callback handler
const successPaymentHandler = asyncHandler(async (req, res) => {
  const result = await paymentService.successPaymentHandler(
    req.params.sessionId,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payment processed successfully",
    data: result,
  });
});

// Get payments list
const getPayments = asyncHandler(async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// Manual status retry check
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

// Create new checkout session for retry
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

// Process doctor no-show refund
const handleDoctorNoShow = asyncHandler(async (req, res) => {
  const result = await paymentService.handleDoctorNoShow(
    req.params.appointmentId,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Doctor no-show recorded and patient refunded",
    data: result,
  });
});

// List payouts for doctor or admin
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

// Admin marks a payout as paid manually
const markPayoutAsPaid = asyncHandler(async (req, res) => {
  const result = await paymentService.markPayoutAsPaid(req.params.payoutId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payout marked as paid",
    data: result,
  });
});

// Check if doctor connect account exists
const getStripeConnectStatus = asyncHandler(async (req, res) => {
  const result = await paymentService.getStripeConnectStatus(req.user.userId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Stripe Connect status retrieved",
    data: result,
  });
});

// Setup onboarding link
const createStripeConnectOnboarding = asyncHandler(async (req, res) => {
  const { returnUrl, refreshUrl } = req.body as {
    returnUrl: string;
    refreshUrl: string;
  };

  const result = await paymentService.createStripeConnectOnboardingLink({
    userId: req.user.userId,
    returnUrl:
      returnUrl ||
      `${process.env.FRONTEND_URL}/dashboard/doctor/payouts?connect=success`,
    refreshUrl:
      refreshUrl ||
      `${process.env.FRONTEND_URL}/dashboard/doctor/payouts?connect=refresh`,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Stripe Connect onboarding link created",
    data: result,
  });
});

// Handle withdraw requests
const withdrawPayout = asyncHandler(async (req, res) => {
  const { payoutId } = req.params;
  const result = await paymentService.withdrawPayout({
    payoutId,
    userId: req.user.userId,
  });

  // 402 tells frontend to prompt connect flow if missing
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

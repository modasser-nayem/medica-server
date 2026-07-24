import { asyncHandler } from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { paymentService } from "./payment.service";

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE WEBHOOK
// ─────────────────────────────────────────────────────────────────────────────

const handleStripeWebhook = asyncHandler(async (req, res) => {
  await paymentService.handleStripeWebhook({
    sig: req.headers["stripe-signature"]!,
    body: req.body,
  });
  res.json({ received: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT CHECKOUT
// ─────────────────────────────────────────────────────────────────────────────

// Verify payment after Stripe redirect — ensures idempotent processing
const verifyPayment = asyncHandler(async (req, res) => {
  const result = await paymentService.verifyAndProcessPayment(req.params.sessionId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payment verified successfully",
    data: result,
  });
});

// Create a new checkout session for a failed appointment
const retryPayment = asyncHandler(async (req, res) => {
  const result = await paymentService.retryPayment(req.body.appointmentId);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "New checkout session created",
    data: result,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REFUND & NO-SHOW
// ─────────────────────────────────────────────────────────────────────────────

// Admin: record doctor no-show and auto-refund patient
const handleDoctorNoShow = asyncHandler(async (req, res) => {
  const result = await paymentService.handleDoctorNoShow(req.params.appointmentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Doctor no-show recorded and patient refunded",
    data: result,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT HISTORY
// ─────────────────────────────────────────────────────────────────────────────

// List payments — each role sees only what they own; admin sees all
const getPayments = asyncHandler(async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: any = { ...req.query };

  if (req.user.role === "PATIENT") {
    filters.patientId = req.user.profileId;
    // Prevent patient from overriding to see other patients
    delete filters.doctorId;
  } else if (req.user.role === "DOCTOR") {
    filters.doctorId = req.user.profileId;
    delete filters.patientId;
  }
  // ADMIN: can filter by either patientId or doctorId via query params

  const result = await paymentService.getPayments(filters);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Payments retrieved successfully",
    data: result.data,
    pagination: result.pagination,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ESCROW PAYOUTS (Admin only — shows per-appointment commission breakdown)
// ─────────────────────────────────────────────────────────────────────────────

const getEscrowPayouts = asyncHandler(async (req, res) => {
  const { doctorId, status, page, limit } = req.query as Record<string, string>;
  const result = await paymentService.getEscrowPayouts({
    doctorId,
    status,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Escrow payouts retrieved successfully",
    data: result.data,
    pagination: result.pagination,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCTOR WALLET
// ─────────────────────────────────────────────────────────────────────────────

// Get doctor wallet balance, upcoming earnings, and lifetime totals
const getDoctorWallet = asyncHandler(async (req, res) => {
  const result = await paymentService.getDoctorWallet(req.user.userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Wallet retrieved successfully",
    data: result,
  });
});

// Instantly withdraw available balance to a card
const withdrawToCard = asyncHandler(async (req, res) => {
  const { amount, cardBrand, cardLast4, cardHolderName } = req.body;
  const result = await paymentService.withdrawToCard({
    userId: req.user.userId,
    amount: Number(amount),
    cardBrand,
    cardLast4,
    cardHolderName,
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Withdrawal successful",
    data: result,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION HISTORY
// ─────────────────────────────────────────────────────────────────────────────

// Transaction ledger — every role sees exactly their own transactions
// Admin can additionally filter by any userId via query param
const getTransactions = asyncHandler(async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: any = { ...req.query };

  if (req.user.role === "PATIENT" || req.user.role === "DOCTOR") {
    // Force to own userId — cannot override via query param
    filters.userId = req.user.userId;
  }
  // ADMIN: no forced userId — can pass ?userId= freely

  const result = await paymentService.getTransactions(filters);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Transactions retrieved successfully",
    data: result.data,
    pagination: result.pagination,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WITHDRAWAL HISTORY
// ─────────────────────────────────────────────────────────────────────────────

// Withdrawal records — doctor sees own; admin sees all or filters by ?doctorId=
const getWithdrawals = asyncHandler(async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: any = { ...req.query };

  if (req.user.role === "DOCTOR") {
    // Force to own doctor profile — cannot override via query param
    filters.doctorId = req.user.profileId;
  }

  const result = await paymentService.getWithdrawals(filters);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Withdrawals retrieved successfully",
    data: result.data,
    pagination: result.pagination,
  });
});

// ─────────────────────────────────────────────────────────────────────────────

export const paymentController = {
  handleStripeWebhook,
  verifyPayment,
  retryPayment,
  handleDoctorNoShow,
  getPayments,
  getEscrowPayouts,
  getDoctorWallet,
  withdrawToCard,
  getTransactions,
  getWithdrawals,
};

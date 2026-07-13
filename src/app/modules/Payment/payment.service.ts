import prisma from "../../../db/connector";
import Stripe from "stripe";
import { ICreatePaymentIntent, IPaymentFilters } from "./payment.interface";
import config from "../../../config";
import AppError from "../../../errors/AppError";
import { paginationHelper } from "../../../utils/pagination";
import stripe from "../../../config/stripe";

// ─────────────────────────────────────────────────────────────────────────────
// Checkout Session
// ─────────────────────────────────────────────────────────────────────────────

const createPaymentCheckoutSession = async (data: ICreatePaymentIntent) => {
  // Stripe requires amounts in the smallest currency unit (cents / paisa)
  const amountInCents = Math.round(data.amount * 100);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: data.currency.toLowerCase(),
          product_data: { name: "Doctor Consultation Fee" },
          unit_amount: amountInCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      appointmentId: data.metadata.appointmentId,
      patientId: data.metadata.patientId,
      doctorId: data.metadata.doctorId,
    },
    // Allow 30 minutes to complete checkout
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${config.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.FRONTEND_URL}/payment/cancel?session_id={CHECKOUT_SESSION_ID}`,
  });

  // Save a PENDING payment record using the Checkout Session ID as externalId
  await prisma.payment.create({
    data: {
      appointmentId: data.metadata.appointmentId,
      amount: amountInCents, // stored in cents to match Stripe
      currency: data.currency,
      externalId: session.id,
      status: "PENDING",
      method: "card",
    },
  });

  return { checkoutUrl: session.url, sessionId: session.id };
};

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Webhook Handler
// ─────────────────────────────────────────────────────────────────────────────

const handleStripeWebhook = async (payload: {
  sig: string | string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}) => {
  const { sig, body } = payload;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      config.stripe.STRIPE_WEBHOOK_SECRET,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    throw new AppError(400, `Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    // ── Payment succeeded ────────────────────────────────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const appointmentId = session.metadata?.appointmentId;
      if (!appointmentId) break;

      if (session.payment_status === "paid") {
        await afterPaymentSuccess({
          sessionId: session.id,
          appointmentId,
          paymentIntentId: session.payment_intent as string | null,
        });
      }
      break;
    }

    // ── Session expired (user closed tab / 30 min timeout) ───────────────────
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handlePaymentFailure({
        sessionId: session.id,
        reason: "Checkout session expired",
      });
      break;
    }

    // ── Explicit payment failure (card declined, 3DS fail, etc.) ────────────
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      // Find our payment record via appointmentId and PENDING status (paymentIntentId is not saved yet)
      const appointmentId = intent.metadata?.appointmentId;
      if (appointmentId) {
        const payment = await prisma.payment.findFirst({
          where: { appointmentId, status: "PENDING" },
        });
        if (payment) {
          await handlePaymentFailure({
            sessionId: payment.externalId,
            reason: intent.last_payment_error?.message ?? "Payment failed",
          });
        }
      }
      break;
    }

    // ── Stripe Transfer confirmed (doctor payout) ────────────────────────────
    case "transfer.created": {
      const transfer = event.data.object as Stripe.Transfer;
      const payout = await prisma.doctorPayout.findFirst({
        where: { stripeTransferId: transfer.id },
      });
      if (payout) {
        await prisma.doctorPayout.update({
          where: { id: payout.id },
          data: { status: "PAID", paidAt: new Date() },
        });
      }
      break;
    }

    default:
      break;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Post-Payment Success (internal)
// ─────────────────────────────────────────────────────────────────────────────

const afterPaymentSuccess = async ({
  sessionId,
  appointmentId,
  paymentIntentId,
}: {
  sessionId: string;
  appointmentId: string;
  paymentIntentId: string | null;
}) => {
  // Idempotency guard — don't process twice
  const existingPayment = await prisma.payment.findUnique({
    where: { externalId: sessionId },
  });
  if (!existingPayment || existingPayment.status === "COMPLETED") return;

  // Mark payment as COMPLETED
  const updatedPayment = await prisma.payment.update({
    where: { externalId: sessionId },
    data: { status: "COMPLETED", paymentIntentId },
  });

  // Confirm appointment
  const appointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CONFIRMED" },
  });

  // Create or restore Consultation record
  await prisma.consultation.upsert({
    where: { appointmentId },
    update: { status: "SCHEDULED" },
    create: { appointmentId, status: "SCHEDULED" },
  });

  // Create DoctorPayout in PENDING state (escrow — held until consultation)
  const existingPayout = await prisma.doctorPayout.findUnique({
    where: { appointmentId },
  });
  if (!existingPayout) {
    await prisma.doctorPayout.create({
      data: {
        appointmentId,
        doctorId: appointment.doctorId,
        paymentId: updatedPayment.id,
        amount: updatedPayment.amount / 100, // convert back from cents
        currency: updatedPayment.currency,
        status: "PENDING",
      },
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Payment Failure Handler (internal)
// ─────────────────────────────────────────────────────────────────────────────

const handlePaymentFailure = async ({
  sessionId,
  reason,
}: {
  sessionId: string;
  reason: string;
}) => {
  const payment = await prisma.payment.findUnique({
    where: { externalId: sessionId },
  });
  if (!payment || payment.status !== "PENDING") return;

  await prisma.payment.update({
    where: { externalId: sessionId },
    data: { status: "FAILED" },
  });

  // Cancel the appointment if it's still PENDING
  await prisma.appointment.update({
    where: { id: payment.appointmentId },
    data: {
      status: "CANCELLED",
      cancelReason: `Payment failed: ${reason}`,
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Refund Payment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Issue a full (or partial) Stripe refund and void the DoctorPayout.
 * @param paymentId       - our internal Payment.id
 * @param paymentIntentId - Stripe payment_intent id
 * @param amountCents     - optional: partial refund amount in cents; omit for full refund
 */
const refundPayment = async (payload: {
  paymentId: string;
  paymentIntentId: string;
  amountCents?: number;
}) => {
  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: payload.paymentIntentId,
  };
  if (payload.amountCents) {
    refundParams.amount = payload.amountCents;
  }

  const refund = await stripe.refunds.create(refundParams);

  await prisma.payment.update({
    where: { id: payload.paymentId },
    data: { status: "REFUNDED" },
  });

  // Void the doctor payout — money is going back to patient
  await prisma.doctorPayout.updateMany({
    where: {
      paymentId: payload.paymentId,
      status: { in: ["PENDING", "ELIGIBLE"] },
    },
    data: { status: "VOIDED" },
  });

  return { refundId: refund.id, status: refund.status ?? "unknown" };
};

// ─────────────────────────────────────────────────────────────────────────────
// Doctor No-Show Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called when the appointment slot has passed and no consultation was initiated.
 * Automatically issues a full refund and marks the payout as VOIDED.
 */
const handleDoctorNoShow = async (appointmentId: string) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      payments: { where: { status: "COMPLETED" } },
      consultation: true,
      payout: true,
    },
  });

  if (!appointment) {
    throw new AppError(404, "Appointment not found");
  }

  // Can only mark no-show if slot has ended and consultation was never started
  const now = new Date();
  if (appointment.endsAt > now) {
    throw new AppError(400, "Appointment slot has not ended yet");
  }

  if (appointment.status !== "CONFIRMED") {
    throw new AppError(400, "Appointment is not in CONFIRMED status");
  }

  if (
    appointment.consultation &&
    appointment.consultation.status === "COMPLETED"
  ) {
    throw new AppError(
      400,
      "Consultation was completed — no-show not applicable",
    );
  }

  // Cancel appointment with no-show reason
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED", cancelReason: "Doctor no-show" },
  });

  // Cancel consultation if it exists but was never completed
  if (appointment.consultation) {
    await prisma.consultation.update({
      where: { id: appointment.consultation.id },
      data: { status: "CANCELLED" },
    });
  }

  // Issue full refund for each completed payment
  const refundResults: { refundId: string; status: string }[] = [];
  for (const payment of appointment.payments) {
    if (!payment.paymentIntentId) continue;

    const refund = await refundPayment({
      paymentId: payment.id,
      paymentIntentId: payment.paymentIntentId,
    });
    refundResults.push(refund);
  }

  // Mark payout as voided with noShowAt timestamp
  if (appointment.payout) {
    await prisma.doctorPayout.update({
      where: { id: appointment.payout.id },
      data: { status: "VOIDED", noShowAt: now },
    });
  }

  return {
    appointmentId,
    refunds: refundResults,
    message: "Doctor no-show recorded. Full refund issued to patient.",
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Release Payout to Doctor (called from consultation.service after endCall)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marks DoctorPayout as ELIGIBLE and initiates a Stripe Transfer
 * if the doctor has a stripeConnectAccountId configured.
 */
const releasePayoutToDoctor = async (appointmentId: string) => {
  const payout = await prisma.doctorPayout.findUnique({
    where: { appointmentId },
    include: { doctor: true },
  });

  if (!payout) return; // no payout record = no payment was ever made
  if (payout.status !== "PENDING") return; // already processed

  const now = new Date();

  // If doctor has Stripe Connect, initiate transfer immediately
  if (payout.doctor.stripeConnectAccountId) {
    try {
      const transfer = await stripe.transfers.create({
        amount: Math.round(Number(payout.amount) * 100), // back to cents
        currency: payout.currency.toLowerCase(),
        destination: payout.doctor.stripeConnectAccountId,
        description: `Consultation payout for appointment ${appointmentId}`,
        metadata: { appointmentId, doctorPayoutId: payout.id },
      });

      await prisma.doctorPayout.update({
        where: { id: payout.id },
        data: {
          status: "PROCESSING",
          stripeTransferId: transfer.id,
          eligibleAt: now,
        },
      });

      return { status: "PROCESSING", stripeTransferId: transfer.id };
    } catch (err) {
      // Transfer failed — mark as ELIGIBLE so admin can handle manually
      console.error("Stripe Transfer failed, marking as ELIGIBLE:", err);
    }
  }

  // No Stripe Connect — mark as ELIGIBLE for manual admin payout
  await prisma.doctorPayout.update({
    where: { id: payout.id },
    data: { status: "ELIGIBLE", eligibleAt: now },
  });

  return { status: "ELIGIBLE" };
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Trigger Manual Payout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin marks a payout as PAID (for bank transfers done outside Stripe).
 */
const markPayoutAsPaid = async (payoutId: string) => {
  const payout = await prisma.doctorPayout.findUnique({
    where: { id: payoutId },
  });

  if (!payout) throw new AppError(404, "Payout record not found");
  if (payout.status === "PAID")
    throw new AppError(400, "Payout already marked as PAID");
  if (payout.status === "VOIDED")
    throw new AppError(400, "Cannot pay out a voided payout");
  if (payout.status === "PENDING") {
    throw new AppError(
      400,
      "Payout is still PENDING — wait for consultation to complete",
    );
  }

  return prisma.doctorPayout.update({
    where: { id: payoutId },
    data: { status: "PAID", paidAt: new Date() },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Connect — Onboarding & Status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns whether the doctor has connected a Stripe account.
 * Used by the frontend to show/hide connect CTA.
 */
const getStripeConnectStatus = async (userId: string) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId },
    select: { id: true, stripeConnectAccountId: true },
  });

  if (!doctor) throw new AppError(404, "Doctor profile not found");

  return {
    isConnected: !!doctor.stripeConnectAccountId,
    stripeConnectAccountId: doctor.stripeConnectAccountId ?? null,
  };
};

/**
 * Creates or retrieves a Stripe Connect Express account for the doctor,
 * then generates a fresh Account Link (onboarding URL) to redirect them to.
 * Call this when the doctor clicks "Connect Bank Account".
 */
const createStripeConnectOnboardingLink = async ({
  userId,
  returnUrl,
  refreshUrl,
}: {
  userId: string;
  returnUrl: string;
  refreshUrl: string;
}) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId },
    include: { user: { select: { email: true, name: true } } },
  });

  if (!doctor) throw new AppError(404, "Doctor profile not found");

  let accountId = doctor.stripeConnectAccountId;

  // Create a new Stripe Connect Express account if one doesn't exist yet
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: doctor.user.email,
      capabilities: {
        transfers: { requested: true },
      },
      business_profile: {
        name: doctor.user.name,
        mcc: "8099", // Health practitioners
        url: config.FRONTEND_URL,
      },
      metadata: { doctorId: doctor.id, userId },
    });

    accountId = account.id;

    // Persist the new account ID immediately
    await prisma.doctor.update({
      where: { id: doctor.id },
      data: { stripeConnectAccountId: accountId },
    });
  }

  // Generate a fresh onboarding link (links expire after a few minutes)
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: "account_onboarding",
  });

  return { url: accountLink.url, accountId };
};

// ─────────────────────────────────────────────────────────────────────────────
// Doctor Self-Service Withdrawal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Doctor requests a withdrawal for a specific ELIGIBLE payout.
 * - If they have a Stripe Connect account → immediate Stripe Transfer.
 * - If not → returns a 402 with needsConnect=true so the frontend
 *   can redirect them to the connect onboarding flow.
 */
const withdrawPayout = async ({
  payoutId,
  userId,
}: {
  payoutId: string;
  userId: string;
}) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId },
    select: { id: true, stripeConnectAccountId: true },
  });

  if (!doctor) throw new AppError(404, "Doctor profile not found");

  const payout = await prisma.doctorPayout.findUnique({
    where: { id: payoutId },
    include: { doctor: true },
  });

  if (!payout) throw new AppError(404, "Payout record not found");
  if (payout.doctorId !== doctor.id) throw new AppError(403, "Access denied");
  if (payout.status !== "ELIGIBLE") {
    throw new AppError(
      400,
      `Cannot withdraw a payout with status: ${payout.status}`,
    );
  }

  // No Stripe Connect yet — tell frontend to prompt connection
  if (!doctor.stripeConnectAccountId) {
    return { needsConnect: true, payoutId };
  }

  // Initiate Stripe Transfer
  const transfer = await stripe.transfers.create({
    amount: Math.round(Number(payout.amount) * 100), // back to cents
    currency: payout.currency.toLowerCase(),
    destination: doctor.stripeConnectAccountId,
    description: `Doctor withdrawal — payout ${payoutId}`,
    metadata: { payoutId, doctorId: doctor.id },
  });

  const updated = await prisma.doctorPayout.update({
    where: { id: payoutId },
    data: {
      status: "PROCESSING",
      stripeTransferId: transfer.id,
    },
  });

  return {
    needsConnect: false,
    status: "PROCESSING",
    stripeTransferId: transfer.id,
    payout: updated,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Get Payouts (admin or doctor)
// ─────────────────────────────────────────────────────────────────────────────

const getPayouts = async (payload: {
  doctorId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) => {
  const { page, limit, skip } = paginationHelper.calculatePagination({
    page: payload.page,
    limit: payload.limit,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (payload.doctorId) where.doctorId = payload.doctorId;
  if (payload.status) where.status = payload.status;

  const [data, total] = await Promise.all([
    prisma.doctorPayout.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        appointment: { select: { startsAt: true, endsAt: true } },
        doctor: { select: { user: { select: { name: true, email: true } } } },
        payment: { select: { amount: true, currency: true, externalId: true } },
      },
    }),
    prisma.doctorPayout.count({ where }),
  ]);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Existing helpers (unchanged surface)
// ─────────────────────────────────────────────────────────────────────────────

const successPaymentHandler = async (sessionId: string) => {
  return retryPaymentProcess({ sessionId });
};

const retryPaymentProcess = async (payload: { sessionId: string }) => {
  const session = await stripe.checkout.sessions.retrieve(payload.sessionId);
  const paymentIntentId = session.payment_intent;

  if (!paymentIntentId || typeof paymentIntentId !== "string") {
    throw new AppError(400, "No payment_intent on session");
  }

  const paymentRecord = await prisma.payment.findUnique({
    where: { externalId: payload.sessionId },
  });

  if (!paymentRecord) throw new AppError(404, "Payment record not found");

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (intent.status === "succeeded") {
    await afterPaymentSuccess({
      sessionId: paymentRecord.externalId,
      appointmentId: paymentRecord.appointmentId,
      paymentIntentId,
    });
  } else if (
    intent.status === "canceled" ||
    intent.status === "requires_payment_method"
  ) {
    await handlePaymentFailure({
      sessionId: paymentRecord.externalId,
      reason: "Payment intent failed or was cancelled",
    });
  }

  return {
    status: intent.status,
    amount: paymentRecord.amount,
    currency: paymentRecord.currency,
  };
};

const repayment = async (payload: { appointmentId: string }) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: payload.appointmentId },
  });

  if (!appointment) throw new AppError(400, "Invalid Appointment ID");

  // Block repayment if already paid
  const existSuccessPayment = await prisma.payment.findFirst({
    where: { appointmentId: appointment.id, status: "COMPLETED" },
  });
  if (existSuccessPayment) throw new AppError(400, "Payment already completed");

  const data: ICreatePaymentIntent = {
    amount: Number(appointment.price),
    currency: appointment.currency,
    metadata: {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
    },
  };

  return createPaymentCheckoutSession(data);
};

const getPayments = async (payload: { filters: IPaymentFilters }) => {
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelper.calculatePagination({
      page: payload.filters.page,
      limit: payload.filters.limit,
      sortBy: payload.filters.sortBy,
      sortOrder: payload.filters.sortOrder,
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (payload.filters.patientId) {
    where.appointment = { patientId: payload.filters.patientId };
  } else if (payload.filters.doctorId) {
    where.appointment = { doctorId: payload.filters.doctorId };
  }
  if (payload.filters.status) {
    where.status = payload.filters.status;
  }
  if (payload.filters.startDate || payload.filters.endDate) {
    where.createdAt = {};
    if (payload.filters.startDate)
      where.createdAt.gte = new Date(payload.filters.startDate);
    if (payload.filters.endDate)
      where.createdAt.lte = new Date(payload.filters.endDate);
  }

  const [data, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        appointment: {
          select: {
            startsAt: true,
            endsAt: true,
            patient: { select: { user: { select: { name: true } } } },
            doctor: { select: { user: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
export const paymentService = {
  createPaymentCheckoutSession,
  handleStripeWebhook,
  successPaymentHandler,
  retryPaymentProcess,
  repayment,
  refundPayment,
  releasePayoutToDoctor,
  handleDoctorNoShow,
  markPayoutAsPaid,
  getPayments,
  getPayouts,
  getStripeConnectStatus,
  createStripeConnectOnboardingLink,
  withdrawPayout,
};

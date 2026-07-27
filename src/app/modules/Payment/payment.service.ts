import prisma from "../../../db/connector";
import Stripe from "stripe";
import {
  ICreatePaymentIntent,
  IPaymentFilters,
  ITransactionFilters,
  IWithdrawalFilters,
} from "./payment.interface";
import config from "../../../config";
import AppError from "../../../errors/AppError";
import { paginationHelper } from "../../../utils/pagination";
import stripe from "../../../config/stripe";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Platform keeps this fraction of every consultation payment
// e.g. 0.1 = 10%  |  override via PLATFORM_COMMISSION_RATE env var
const PLATFORM_COMMISSION_RATE = Number(
  process.env.PLATFORM_COMMISSION_RATE ?? 0.1,
);

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT CHECKOUT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a Stripe Checkout Session for the patient to pay for an appointment.
 * Money lands in the PLATFORM Stripe account — no Stripe Connect involved.
 */
const createCheckoutSession = async (data: ICreatePaymentIntent) => {
  const amountInCents = Math.round(data.amount * 100);

  let success_url = data.successUrl;
  if (!success_url.includes("{CHECKOUT_SESSION_ID}")) {
    const successSeparator = success_url.includes("?") ? "&" : "?";
    success_url = `${success_url}${successSeparator}session_id={CHECKOUT_SESSION_ID}`;
  }
  if (!success_url.includes("appointmentId=")) {
    success_url = `${success_url}&appointmentId=${data.metadata.appointmentId}`;
  }

  let cancel_url = data.cancelUrl;
  if (!cancel_url.includes("{CHECKOUT_SESSION_ID}")) {
    const cancelSeparator = cancel_url.includes("?") ? "&" : "?";
    cancel_url = `${cancel_url}${cancelSeparator}session_id={CHECKOUT_SESSION_ID}`;
  }

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
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min
    success_url: success_url,
    cancel_url: cancel_url,
  });

  await prisma.payment.create({
    data: {
      appointmentId: data.metadata.appointmentId,
      amount: data.amount,
      currency: data.currency,
      externalId: session.id,
      status: "PENDING",
      method: "card",
    },
  });

  return { checkoutUrl: session.url, sessionId: session.id };
};

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE WEBHOOK
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleStripeWebhook = async (payload: {
  sig: string | string[];
  body: any;
}) => {
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload.body,
      payload.sig,
      config.stripe.STRIPE_WEBHOOK_SECRET,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    throw new AppError(400, `Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (
        session.payment_status === "paid" &&
        session.metadata?.appointmentId
      ) {
        await _onPaymentSuccess({
          sessionId: session.id,
          appointmentId: session.metadata.appointmentId,
          paymentIntentId: session.payment_intent as string | null,
        });
      }
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await _onPaymentFailure({
        sessionId: session.id,
        reason: "Checkout session expired",
      });
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const payment = await prisma.payment.findFirst({
        where: { paymentIntentId: intent.id, status: "PENDING" },
      });
      if (payment) {
        await _onPaymentFailure({
          sessionId: payment.externalId,
          reason: intent.last_payment_error?.message ?? "Payment failed",
        });
      }
      break;
    }
    default:
      break;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL PAYMENT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called after Stripe confirms payment:
 *  1. Marks Payment → COMPLETED
 *  2. Confirms Appointment
 *  3. Creates Consultation (SCHEDULED)
 *  4. Creates DoctorPayout escrow record with commission split pre-calculated
 *  5. Logs a DEBIT Transaction for the patient (they spent money)
 */
const _onPaymentSuccess = async ({
  sessionId,
  appointmentId,
  paymentIntentId,
}: {
  sessionId: string;
  appointmentId: string;
  paymentIntentId: string | null;
}) => {
  const existing = await prisma.payment.findUnique({
    where: { externalId: sessionId },
  });
  if (!existing || existing.status === "COMPLETED") return;

  await prisma.$transaction(async (tx) => {
    // 1. Complete payment record
    const updatedPayment = await tx.payment.update({
      where: { externalId: sessionId },
      data: { status: "COMPLETED", paymentIntentId },
    });

    // 2. Confirm appointment
    const appointment = await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: "CONFIRMED" },
      include: {
        patient: { select: { userId: true } },
      },
    });

    // 3. Create consultation record
    await tx.consultation.upsert({
      where: { appointmentId },
      update: { status: "SCHEDULED" },
      create: { appointmentId, status: "SCHEDULED" },
    });

    // 4. Create escrow payout with commission split
    const grossAmount = Number(updatedPayment.amount); // use base unit directly
    const commissionRate = PLATFORM_COMMISSION_RATE;
    const commissionAmount =
      Math.round(grossAmount * commissionRate * 100) / 100;
    const doctorAmount =
      Math.round((grossAmount - commissionAmount) * 100) / 100;

    const existingPayout = await tx.doctorPayout.findUnique({
      where: { appointmentId },
    });
    if (!existingPayout) {
      await tx.doctorPayout.create({
        data: {
          appointmentId,
          doctorId: appointment.doctorId,
          paymentId: updatedPayment.id,
          amount: grossAmount,
          commissionRate,
          commissionAmount,
          doctorAmount,
          currency: updatedPayment.currency,
          status: "PENDING",
        },
      });
    }

    // 5. Log DEBIT transaction for patient (money spent)
    await tx.transaction.create({
      data: {
        userId: appointment.patient.userId,
        amount: grossAmount,
        currency: updatedPayment.currency,
        type: "DEBIT",
        status: "SUCCESS",
        description: `Payment for consultation (Appointment #${appointmentId})`,
        referenceId: updatedPayment.id,
      },
    });
  });
};

/**
 * Called when payment fails or session expires — cancels the appointment
 * and logs a FAILED DEBIT transaction for the patient.
 */
const _onPaymentFailure = async ({
  sessionId,
  reason,
}: {
  sessionId: string;
  reason: string;
}) => {
  const payment = await prisma.payment.findUnique({
    where: { externalId: sessionId },
    include: {
      appointment: {
        include: { patient: { select: { userId: true } } },
      },
    },
  });
  if (!payment || payment.status !== "PENDING") return;

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { externalId: sessionId },
      data: { status: "FAILED" },
    });
    await tx.appointment.update({
      where: { id: payment.appointmentId },
      data: { status: "CANCELLED", cancelReason: `Payment failed: ${reason}` },
    });
    // Log FAILED DEBIT for patient so they see the attempt in their history
    await tx.transaction.create({
      data: {
        userId: payment.appointment.patient.userId,
        amount: Number(payment.amount),
        currency: payment.currency,
        type: "DEBIT",
        status: "FAILED",
        description: `Failed payment for consultation — ${reason}`,
        referenceId: payment.id,
      },
    });
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT STATUS & RETRY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifies a Stripe session and processes success or failure.
 * Used on the payment success redirect page as a safety net.
 */
const verifyAndProcessPayment = async (sessionId: string) => {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const paymentIntentId = session.payment_intent;

  if (!paymentIntentId || typeof paymentIntentId !== "string") {
    throw new AppError(400, "No payment intent on session");
  }

  const paymentRecord = await prisma.payment.findUnique({
    where: { externalId: sessionId },
  });
  if (!paymentRecord) throw new AppError(404, "Payment record not found");

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (intent.status === "succeeded") {
    await _onPaymentSuccess({
      sessionId: paymentRecord.externalId,
      appointmentId: paymentRecord.appointmentId,
      paymentIntentId,
    });
  } else if (
    intent.status === "canceled" ||
    intent.status === "requires_payment_method"
  ) {
    await _onPaymentFailure({
      sessionId: paymentRecord.externalId,
      reason: "Payment intent failed or was cancelled",
    });
  }

  return {
    status: intent.status,
    amount: Number(paymentRecord.amount),
    currency: paymentRecord.currency,
  };
};

/** Creates a new Stripe checkout session for a previously failed appointment */
const retryPayment = async (payload: { appointmentId: string; successUrl: string; cancelUrl: string }) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: payload.appointmentId },
  });
  if (!appointment) throw new AppError(404, "Appointment not found");

  const completed = await prisma.payment.findFirst({
    where: { appointmentId: payload.appointmentId, status: "COMPLETED" },
  });
  if (completed)
    throw new AppError(400, "Payment already completed for this appointment");

  return createCheckoutSession({
    amount: Number(appointment.price),
    currency: appointment.currency,
    successUrl: payload.successUrl,
    cancelUrl: payload.cancelUrl,
    metadata: {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// REFUND & NO-SHOW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Issues a Stripe refund and:
 *  - Marks Payment → REFUNDED
 *  - Voids the DoctorPayout escrow
 *  - Logs a CREDIT Transaction for the patient (money back)
 */
const refundPayment = async (paymentId: string, paymentIntentId: string) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      appointment: {
        include: { patient: { select: { userId: true } } },
      },
    },
  });
  if (!payment) throw new AppError(404, "Payment record not found");

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
  });

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: "REFUNDED" },
    });

    await tx.doctorPayout.updateMany({
      where: { paymentId, status: "PENDING" },
      data: { status: "VOIDED" },
    });

    // If doctor had already been paid, claw back from their balance
    const paidPayout = await tx.doctorPayout.findFirst({
      where: { paymentId, status: "PAID" },
      include: { doctor: { select: { userId: true } } },
    });
    if (paidPayout) {
      await tx.doctor.update({
        where: { id: paidPayout.doctorId },
        data: { balance: { decrement: paidPayout.doctorAmount } },
      });
      await tx.doctorPayout.update({
        where: { id: paidPayout.id },
        data: { status: "VOIDED" },
      });
      // Log DEBIT for doctor (clawback)
      await tx.transaction.create({
        data: {
          userId: paidPayout.doctor.userId, // correctly linked to doctor
          amount: paidPayout.doctorAmount,
          currency: paidPayout.currency,
          type: "DEBIT",
          status: "SUCCESS",
          description: `Earnings reversed due to refund (Appointment #${payment.appointmentId})`,
          referenceId: paymentId,
        },
      });
    }

    // Log CREDIT for patient (money back)
    await tx.transaction.create({
      data: {
        userId: payment.appointment.patient.userId,
        amount: Number(payment.amount),
        currency: payment.currency,
        type: "CREDIT",
        status: "SUCCESS",
        description: `Refund received for consultation (Appointment #${payment.appointmentId})`,
        referenceId: paymentId,
      },
    });
  });

  return { refundId: refund.id, status: refund.status ?? "unknown" };
};

/** Handles doctor no-show — refunds patient and voids payout atomically */
const handleDoctorNoShow = async (appointmentId: string) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      payments: { where: { status: "COMPLETED" } },
      consultation: true,
      payout: true,
    },
  });

  if (!appointment) throw new AppError(404, "Appointment not found");
  if (appointment.endsAt > new Date())
    throw new AppError(400, "Appointment slot has not ended yet");
  if (appointment.status !== "CONFIRMED")
    throw new AppError(400, "Appointment is not CONFIRMED");
  if (appointment.consultation?.status === "COMPLETED") {
    throw new AppError(
      400,
      "Consultation was already completed — no-show not applicable",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: "CANCELLED", cancelReason: "Doctor no-show" },
    });

    if (appointment.consultation) {
      await tx.consultation.update({
        where: { id: appointment.consultation.id },
        data: { status: "CANCELLED" },
      });
    }

    if (appointment.payout) {
      await tx.doctorPayout.update({
        where: { id: appointment.payout.id },
        data: { status: "VOIDED", noShowAt: new Date() },
      });
    }
  });

  // Issue Stripe refunds for all completed payments
  const refundResults: { refundId: string; status: string }[] = [];
  for (const payment of appointment.payments) {
    if (!payment.paymentIntentId) continue;
    const result = await refundPayment(payment.id, payment.paymentIntentId);
    refundResults.push(result);
  }

  return { appointmentId, refunds: refundResults };
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCTOR WALLET & EARNINGS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Credits doctor wallet when consultation is completed.
 * Doctor receives doctorAmount (gross - commission).
 * Called from consultation/prescription services after a consultation ends.
 */
const creditDoctorEarnings = async (appointmentId: string) => {
  const payout = await prisma.doctorPayout.findUnique({
    where: { appointmentId },
    include: { doctor: { select: { userId: true } } },
  });

  if (!payout || payout.status !== "PENDING") return;

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // 1. Mark payout PAID
    await tx.doctorPayout.update({
      where: { id: payout.id },
      data: { status: "PAID", eligibleAt: now, paidAt: now },
    });

    // 2. Credit only the doctor's share (gross - commission)
    await tx.doctor.update({
      where: { id: payout.doctorId },
      data: { balance: { increment: payout.doctorAmount } },
    });

    // 3. Log CREDIT transaction for doctor
    await tx.transaction.create({
      data: {
        userId: payout.doctor.userId,
        amount: payout.doctorAmount,
        currency: payout.currency,
        type: "CREDIT",
        status: "SUCCESS",
        description: `Consultation earnings credited — platform commission ${Number(payout.commissionRate) * 100}% deducted (Appointment #${appointmentId})`,
        referenceId: appointmentId,
      },
    });
  });

  return {
    status: "PAID",
    grossAmount: payout.amount,
    commissionAmount: payout.commissionAmount,
    doctorAmount: payout.doctorAmount,
  };
};

/**
 * Returns doctor wallet balance, total earned, total withdrawn, and
 * all PENDING payouts (upcoming earnings from completed-but-not-yet-credited sessions).
 */
const getDoctorWallet = async (userId: string) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId },
    select: { id: true, balance: true },
  });
  if (!doctor) throw new AppError(404, "Doctor profile not found");

  const [totalEarned, totalWithdrawn, pendingPayouts] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, type: "CREDIT", status: "SUCCESS" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: "DEBIT", status: "SUCCESS" },
      _sum: { amount: true },
    }),
    // Upcoming earnings: PENDING payouts not yet credited to wallet
    prisma.doctorPayout.findMany({
      where: { doctorId: doctor.id, status: "PENDING" },
      select: {
        id: true,
        doctorAmount: true,
        commissionRate: true,
        commissionAmount: true,
        currency: true,
        appointment: { select: { startsAt: true, endsAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const upcomingTotal = pendingPayouts.reduce(
    (sum, p) => sum + Number(p.doctorAmount),
    0,
  );

  return {
    balance: doctor.balance, // available to withdraw right now
    totalEarned: totalEarned._sum.amount ?? 0,
    totalWithdrawn: totalWithdrawn._sum.amount ?? 0,
    upcomingEarnings: {
      total: upcomingTotal, // pending from active consultations
      payouts: pendingPayouts,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CARD WITHDRAWAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Instantly withdraws available balance to a doctor's card.
 * Balance check + deduction + transaction log are all atomic.
 */
const withdrawToCard = async ({
  userId,
  amount,
  cardBrand,
  cardLast4,
  cardHolderName,
}: {
  userId: string;
  amount: number;
  cardBrand: string;
  cardLast4: string;
  cardHolderName: string;
}) => {
  if (amount <= 0)
    throw new AppError(400, "Withdrawal amount must be greater than zero");

  const doctor = await prisma.doctor.findUnique({ where: { userId } });
  if (!doctor) throw new AppError(404, "Doctor profile not found");

  return prisma.$transaction(async (tx) => {
    // Re-fetch inside transaction for accurate balance (prevents race conditions)
    const fresh = await tx.doctor.findUnique({ where: { id: doctor.id } });
    if (!fresh) throw new AppError(404, "Doctor profile not found");

    const available = Number(fresh.balance);
    if (available < amount) {
      throw new AppError(
        400,
        `Insufficient balance. Available: ${available.toFixed(2)}, Requested: ${amount.toFixed(2)}`,
      );
    }

    // Deduct balance
    const updated = await tx.doctor.update({
      where: { id: doctor.id },
      data: { balance: { decrement: amount } },
      select: { balance: true },
    });

    // Record withdrawal
    const withdrawal = await tx.withdrawal.create({
      data: {
        doctorId: doctor.id,
        amount,
        currency: "USD",
        status: "SUCCESS",
        cardBrand,
        cardLast4,
        cardHolderName,
      },
    });

    // Log DEBIT transaction for doctor
    await tx.transaction.create({
      data: {
        userId,
        amount,
        currency: "USD",
        type: "DEBIT",
        status: "SUCCESS",
        description: `Withdrawal to ${cardBrand} card ending in ${cardLast4}`,
        referenceId: withdrawal.id,
        withdrawalId: withdrawal.id,
      },
    });

    return { withdrawal, newBalance: updated.balance };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION HISTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filterable transaction ledger.
 * - Doctor: sees own transactions (earnings, withdrawals)
 * - Patient: sees own transactions (payments, refunds)
 * - Admin: sees all (filter by userId, type, date range)
 */
const getTransactions = async (filters: ITransactionFilters) => {
  const { page, limit, skip } = paginationHelper.calculatePagination({
    page: filters.page,
    limit: filters.limit,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (filters.userId) where.userId = filters.userId;
  if (filters.type) where.type = filters.type;
  if (filters.status) where.status = filters.status;
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
    if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
  }

  const [data, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true, role: true } },
        withdrawal: {
          select: { cardBrand: true, cardLast4: true, cardHolderName: true },
        },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// WITHDRAWAL HISTORY
// ─────────────────────────────────────────────────────────────────────────────

const getWithdrawals = async (filters: IWithdrawalFilters) => {
  const { page, limit, skip } = paginationHelper.calculatePagination({
    page: filters.page,
    limit: filters.limit,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (filters.doctorId) where.doctorId = filters.doctorId;
  if (filters.status) where.status = filters.status;

  const [data, total] = await Promise.all([
    prisma.withdrawal.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        doctor: { select: { user: { select: { name: true, email: true } } } },
      },
    }),
    prisma.withdrawal.count({ where }),
  ]);

  return {
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT HISTORY
// ─────────────────────────────────────────────────────────────────────────────

const getPayments = async (filters: IPaymentFilters) => {
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelper.calculatePagination({
      page: filters.page,
      limit: filters.limit,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (filters.patientId) where.appointment = { patientId: filters.patientId };
  else if (filters.doctorId) where.appointment = { doctorId: filters.doctorId };
  if (filters.status) where.status = filters.status;
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
    if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
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
            price: true,
            patient: { select: { user: { select: { name: true } } } },
            doctor: { select: { user: { select: { name: true } } } },
          },
        },
        payout: {
          select: {
            status: true,
            amount: true,
            commissionAmount: true,
            doctorAmount: true,
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
// ESCROW PAYOUTS (Admin view — shows commission breakdown per appointment)
// ─────────────────────────────────────────────────────────────────────────────

const getEscrowPayouts = async (filters: {
  doctorId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) => {
  const { page, limit, skip } = paginationHelper.calculatePagination({
    page: filters.page,
    limit: filters.limit,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (filters.doctorId) where.doctorId = filters.doctorId;
  if (filters.status) where.status = filters.status;

  const [data, total] = await Promise.all([
    prisma.doctorPayout.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        appointment: { select: { startsAt: true, endsAt: true } },
        doctor: { select: { user: { select: { name: true, email: true } } } },
        payment: {
          select: {
            amount: true,
            currency: true,
            externalId: true,
            status: true,
          },
        },
      },
    }),
    prisma.doctorPayout.count({ where }),
  ]);

  return {
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ─────────────────────────────────────────────────────────────────────────────

export const paymentService = {
  createCheckoutSession,
  handleStripeWebhook,
  verifyAndProcessPayment,
  retryPayment,
  refundPayment,
  handleDoctorNoShow,
  creditDoctorEarnings,
  getDoctorWallet,
  withdrawToCard,
  getTransactions,
  getWithdrawals,
  getPayments,
  getEscrowPayouts,
};

import prisma from "../../../db/connector";
import Stripe from "stripe";
import { ICreatePaymentIntent, IPaymentFilters } from "./payment.interface";
import config from "../../../config";
import AppError from "../../../errors/AppError";
import { paginationHelper } from "../../../utils/pagination";
import stripe from "../../../config/stripe";

// Checkout Session creation
const createPaymentCheckoutSession = async (data: ICreatePaymentIntent) => {
  // stripe expects amount in cents
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
    // expires in 30 minutes
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${config.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.FRONTEND_URL}/payment/cancel?session_id={CHECKOUT_SESSION_ID}`,
  });

  // create a pending payment record
  await prisma.payment.create({
    data: {
      appointmentId: data.metadata.appointmentId,
      amount: amountInCents,
      currency: data.currency,
      externalId: session.id,
      status: "PENDING",
      method: "card",
    },
  });

  return { checkoutUrl: session.url, sessionId: session.id };
};

// Stripe Webhook Handler
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
    // Payment succeeded
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

    // Session expired
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handlePaymentFailure({
        sessionId: session.id,
        reason: "Checkout session expired",
      });
      break;
    }

    // Explicit payment failure
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      // find pending payment record using metadata
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

    // Transfer completed
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

// Post-Payment Success actions
const afterPaymentSuccess = async ({
  sessionId,
  appointmentId,
  paymentIntentId,
}: {
  sessionId: string;
  appointmentId: string;
  paymentIntentId: string | null;
}) => {
  // avoid double processing
  const existingPayment = await prisma.payment.findUnique({
    where: { externalId: sessionId },
  });
  if (!existingPayment || existingPayment.status === "COMPLETED") return;

  const updatedPayment = await prisma.payment.update({
    where: { externalId: sessionId },
    data: { status: "COMPLETED", paymentIntentId },
  });

  const appointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CONFIRMED" },
  });

  // set up consultation
  await prisma.consultation.upsert({
    where: { appointmentId },
    update: { status: "SCHEDULED" },
    create: { appointmentId, status: "SCHEDULED" },
  });

  // holding payout in pending state
  const existingPayout = await prisma.doctorPayout.findUnique({
    where: { appointmentId },
  });
  if (!existingPayout) {
    await prisma.doctorPayout.create({
      data: {
        appointmentId,
        doctorId: appointment.doctorId,
        paymentId: updatedPayment.id,
        amount: updatedPayment.amount / 100, // back to major currency unit
        currency: updatedPayment.currency,
        status: "PENDING",
      },
    });
  }
};

// Payment Failure Handler
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

  // cancel the pending appointment
  await prisma.appointment.update({
    where: { id: payment.appointmentId },
    data: {
      status: "CANCELLED",
      cancelReason: `Payment failed: ${reason}`,
    },
  });
};

// Refund payment and update records
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

  // cancel the payout
  await prisma.doctorPayout.updateMany({
    where: {
      paymentId: payload.paymentId,
      status: { in: ["PENDING", "ELIGIBLE"] },
    },
    data: { status: "VOIDED" },
  });

  return { refundId: refund.id, status: refund.status ?? "unknown" };
};

// Handle cases where the doctor missed the appointment slot
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

  // validation check for slot timing
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

  // cancel everything
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED", cancelReason: "Doctor no-show" },
  });

  if (appointment.consultation) {
    await prisma.consultation.update({
      where: { id: appointment.consultation.id },
      data: { status: "CANCELLED" },
    });
  }

  // refund all payments
  const refundResults: { refundId: string; status: string }[] = [];
  for (const payment of appointment.payments) {
    if (!payment.paymentIntentId) continue;

    const refund = await refundPayment({
      paymentId: payment.id,
      paymentIntentId: payment.paymentIntentId,
    });
    refundResults.push(refund);
  }

  // void the payout
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

// Release payout to doctor once call ends
const releasePayoutToDoctor = async (appointmentId: string) => {
  const payout = await prisma.doctorPayout.findUnique({
    where: { appointmentId },
    include: { doctor: true },
  });

  if (!payout) return;
  if (payout.status !== "PENDING") return;

  const now = new Date();

  // transfer immediately if stripe connect is set up
  if (payout.doctor.stripeConnectAccountId) {
    try {
      const transfer = await stripe.transfers.create({
        amount: Math.round(Number(payout.amount) * 100),
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
      console.error("Stripe Transfer failed, marking as ELIGIBLE:", err);
    }
  }

  // mark eligible for manual admin transfer
  await prisma.doctorPayout.update({
    where: { id: payout.id },
    data: { status: "ELIGIBLE", eligibleAt: now },
  });

  return { status: "ELIGIBLE" };
};

// Admin marks a payout as paid manually
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

// Check doctor's Stripe Connect status
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

// Generate Stripe Connect Express onboarding url
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

  // create express account if it does not exist
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: doctor.user.email,
      capabilities: {
        transfers: { requested: true },
      },
      business_profile: {
        name: doctor.user.name,
        mcc: "8099",
        url: config.FRONTEND_URL,
      },
      metadata: { doctorId: doctor.id, userId },
    });

    accountId = account.id;

    await prisma.doctor.update({
      where: { id: doctor.id },
      data: { stripeConnectAccountId: accountId },
    });
  }

  // generate signup link
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: "account_onboarding",
  });

  return { url: accountLink.url, accountId };
};

// Handle withdrawal requests
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

  if (!doctor.stripeConnectAccountId) {
    return { needsConnect: true, payoutId };
  }

  // transfer the funds
  const transfer = await stripe.transfers.create({
    amount: Math.round(Number(payout.amount) * 100),
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

// Retrieve doctor payouts
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

// Success payment redirect
const successPaymentHandler = async (sessionId: string) => {
  return retryPaymentProcess({ sessionId });
};

// Verify checkout status and process success or failure
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

// Create new checkout session for repayment
const repayment = async (payload: { appointmentId: string }) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: payload.appointmentId },
  });

  if (!appointment) throw new AppError(400, "Invalid Appointment ID");

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

// Retrieve payments list
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

import { PaginationQuery } from "../../../utils/pagination";

export interface ICreatePaymentIntent {
  amount: number;
  currency: string;
  metadata: {
    appointmentId: string;
    patientId: string;
    doctorId: string;
  };
}

export interface IPaymentFilters extends PaginationQuery {
  patientId?: string;
  doctorId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface IPaymentStats {
  total: number;
  totalAmount: number;
  byStatus: Record<string, number>;
  byMonth: Record<string, number>;
}

export interface IPaymentRefund {
  paymentId: string;
  amount?: number;
  reason?: string;
}

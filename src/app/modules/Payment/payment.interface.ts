export interface ICreatePaymentIntent {
  amount: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  metadata: {
    appointmentId: string;
    patientId: string;
    doctorId: string;
  };
}

export interface IPaymentFilters {
  patientId?: string;
  doctorId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
}

export interface ITransactionFilters {
  userId?: string;
  type?: "CREDIT" | "DEBIT";
  status?: "SUCCESS" | "FAILED";
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface IWithdrawalFilters {
  doctorId?: string;
  status?: "SUCCESS" | "FAILED";
  page?: number;
  limit?: number;
}

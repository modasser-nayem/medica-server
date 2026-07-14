/* eslint-disable @typescript-eslint/no-explicit-any */
export interface IAdminStats {
  totalUsers: number;
  activeUsers: number;
  totalDoctor: number;
  totalPatient: number;
  totalRevenue: number;
  completedAppointments: number;
  todaysAppointments: number;
}

export interface IDoctorStats {
  completedAppointments: number;
  pendingAppointments: number;
  todaysAppointments: number;
  upcomingAppointment: any | null;
}

export interface IPatientStats {
  completedAppointments: number;
  pendingAppointments: number;
  scheduledAppointments: number;
  upcomingAppointment: any | null;
}

export interface IPublicStats {
  totalUsers: number;
  totalDoctors: number;
  completedAppointments: number;
}

export interface IUserActivityLog {
  id: string;
  userId: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  action: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface IGetUserActivityFilters {
  userId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

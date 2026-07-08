import { z } from "zod";
import { userSchemaValidation } from "./user.validation";
import { TUserRole } from "../../../types/global";
import { PaginationQuery } from "../../../utils/pagination";

export type TUpdateUserProfile = z.infer<
  typeof userSchemaValidation.updateUserProfile
>;

export type TUpdatePatientProfile = z.infer<
  typeof userSchemaValidation.updatePatientProfile
>;

export type TUpdateDoctorProfile = z.infer<
  typeof userSchemaValidation.updateDoctorProfile
>;

export interface TGetUsersFilter extends PaginationQuery {
  search?: string;
  active?: "yes" | "no";
  role?: TUserRole;
}

export interface IUserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  address: string | null;
  profileImage: string | null;
  role: TUserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserProfileWithDetails extends IUserProfile {
  patientProfile?: {
    id: string;
    bloodGroup: string | null;
    emergencyContact: string | null;
    medicalHistory: string | null;
    allergies: string | null;
  } | null;
  doctorProfile?: {
    id: string;
    department: {
      id: string;
      name: string;
    };
    specialization: string;
    qualifications: string;
    experience: number;
    licenseNumber: string;
    isAvailable: boolean;
  } | null;
  adminProfile?: {
    id: string;
    role: string;
  } | null;
}

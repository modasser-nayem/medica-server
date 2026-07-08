import { z } from "zod";

const updateUserProfile = z.object({
  name: z
    .string()
    .min(3, "Name must be at least 3 characters")
    .max(50, "Name too long")
    .optional(),
  email: z.string().email("Invalid email address").optional(),
  phone: z.string().optional(),
  dateOfBirth: z
    .string({ required_error: "Date Of Birth is required" })
    .datetime()
    .optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  address: z.string().optional(),
  profileImage: z.string().optional(),
});

const updatePatientProfile = z.object({
  bloodGroup: z
    .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
    .optional(),
  emergencyContact: z.string().optional(),
  medicalHistory: z.string().optional(),
  allergies: z.string().optional(),
});

const updateDoctorProfile = z.object({
  departmentId: z.string().uuid("Invalid department ID").optional(),
  specialties: z.string().min(3, "specialties min 3 character").optional(),
  qualification: z
    .string()
    .min(3, "Qualification at least 3 character")
    .optional(),
  experience: z
    .number()
    .min(0, "Experience must be non-negative")
    .max(50, "Experience too high")
    .optional(),
  bio: z.string().min(25, "bio min 25 character").optional(),
  timezone: z.string().optional(),
  consultationFee: z.number().min(0, "Consultation fee must be non-negative").optional(),
});

export const userSchemaValidation = {
  updateUserProfile,
  updateDoctorProfile,
  updatePatientProfile,
};

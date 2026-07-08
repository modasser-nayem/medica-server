import { z } from "zod";

const createDepartment = z.object({
  name: z
    .string({ required_error: "Department name is required" })
    .min(3, "Department name must be at least 3 characters"),
  icon: z.string().url({ message: "Invalid icon url" }),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .optional(),
});

const updateDepartment = z.object({
  name: z
    .string()
    .min(3, "Department name must be at least 3 characters")
    .optional(),
  icon: z.string().url({ message: "Invalid icon url" }).optional(),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .optional(),
});

export const departmentSchemaValidation = {
  createDepartment,
  updateDepartment,
};

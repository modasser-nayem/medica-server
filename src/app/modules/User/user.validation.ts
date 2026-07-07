import { z } from "zod";

const updateUserProfile = z.object({
  name: z
    .string()
    .min(3, "Name must be at least 3 characters")
    .max(50, "Name too long")
    .optional(),
  avatar: z.string().optional(),
});

export const userSchemaValidation = {
  updateUserProfile,
};

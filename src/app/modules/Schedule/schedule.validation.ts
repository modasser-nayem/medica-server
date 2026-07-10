import { z } from "zod";

const createSchedule = z.object({
  body: z
    .object({
      dayOfWeek: z
        .number()
        .min(0, "Day of week must be between 0 and 6")
        .max(6, "Day of week must be between 0 and 6"),
      startTime: z
        .string()
        .regex(
          /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
          "Invalid time format (HH:MM)",
        ),
      endTime: z
        .string()
        .regex(
          /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
          "Invalid time format (HH:MM)",
        ),
      slotDurationMinutes: z.number().optional(),
    })
    .refine(
      (data) => {
        const [sh, sm] = data.startTime.split(":").map(Number);
        const [eh, em] = data.endTime.split(":").map(Number);
        return eh * 60 + em > sh * 60 + sm;
      },
      { message: "End time must be after start time", path: ["endTime"] },
    ),
});

const updateSchedule = z.object({
  body: z
    .object({
      dayOfWeek: z
        .number()
        .min(0, "Day of week must be between 0 and 6")
        .max(6, "Day of week must be between 0 and 6"),
      startTime: z
        .string()
        .regex(
          /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
          "Invalid time format (HH:MM)",
        ),
      endTime: z
        .string()
        .regex(
          /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
          "Invalid time format (HH:MM)",
        ),
      isActive: z.boolean().optional(),
      slotDurationMinutes: z.number().optional(),
    })
    .refine(
      (data) => {
        const [sh, sm] = data.startTime.split(":").map(Number);
        const [eh, em] = data.endTime.split(":").map(Number);
        return eh * 60 + em > sh * 60 + sm;
      },
      { message: "End time must be after start time", path: ["endTime"] },
    ),
});

const createScheduleException = z.object({
  body: z
    .object({
      date: z.string({ required_error: "date is required" }),
      closed: z.boolean().optional(),
      startTime: z
        .string()
        .regex(
          /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
          "Invalid time format (HH:MM)",
        )
        .optional(),
      endTime: z
        .string()
        .regex(
          /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
          "Invalid time format (HH:MM)",
        )
        .optional(),
      blockedSlots: z.array(z.string()).optional(),
      note: z.string().optional(),
    })
    .refine(
      (data) => {
        if (!data.startTime || !data.endTime) return true;
        const [sh, sm] = data.startTime.split(":").map(Number);
        const [eh, em] = data.endTime.split(":").map(Number);
        return eh * 60 + em > sh * 60 + sm;
      },
      { message: "End time must be after start time", path: ["endTime"] },
    ),
});

export const scheduleSchemaValidation = {
  createSchedule,
  updateSchedule,
  createScheduleException,
};

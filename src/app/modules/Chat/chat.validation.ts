import { z } from "zod";

const sendMessage = z.object({
  body: z.object({
    recipientId: z.string({
      required_error: "Recipient ID is required",
    }),
    text: z.string().optional(),
    attachment: z.string().url().optional(),
  }).refine((data) => data.text || data.attachment, {
    message: "Either text or attachment must be provided",
  }),
});

export const chatValidation = {
  sendMessage,
};

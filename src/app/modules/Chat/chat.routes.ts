import express from "express";
import { authorize } from "../../middlewares/authorize";
import { chatController } from "./chat.controller";
import { uploadAttachmentMiddleware } from "../../../upload/fileUpload";

const router = express.Router();

// list all threads
router.get(
  "/threads",
  authorize("PATIENT", "DOCTOR"),
  chatController.getThreads,
);

// load message history
router.get(
  "/threads/:threadId/messages",
  authorize("PATIENT", "DOCTOR"),
  chatController.getThreadMessages,
);

// upload attachment
router.post(
  "/upload",
  authorize("PATIENT", "DOCTOR"),
  uploadAttachmentMiddleware.single("file"),
  chatController.uploadAttachment,
);

export const chatRoutes = router;

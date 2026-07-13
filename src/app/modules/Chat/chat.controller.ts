import { asyncHandler } from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { chatService } from "./chat.service";
import { FileUploadHelper, UploadFolder } from "../../../upload/fileUpload";
import AppError from "../../../errors/AppError";

// Get all threads
const getThreads = asyncHandler(async (req, res) => {
  const result = await chatService.getThreads({
    userId: req.user.userId,
    role: req.user.role,
    profileId: req.user.profileId!,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Chat threads retrieved successfully",
    data: result,
  });
});

// Load message history
const getThreadMessages = asyncHandler(async (req, res) => {
  const result = await chatService.getThreadMessages(req.params.threadId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Messages retrieved successfully",
    data: result,
  });
});

// Upload file attachment
const uploadAttachment = asyncHandler(async (req, res) => {
  const uploaded = await FileUploadHelper.uploadSingle(
    req.file,
    {
      folderName: UploadFolder.CHAT_ATTACHMENTS,
      required: true,
      fieldLabel: "Attachment",
    },
  );

  if (!uploaded) {
    throw new AppError(400, "Upload failed");
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "File uploaded successfully",
    data: {
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      format: uploaded.format,
      bytes: uploaded.bytes,
      resourceType: uploaded.resource_type,
    },
  });
});

export const chatController = {
  getThreads,
  getThreadMessages,
  uploadAttachment,
};

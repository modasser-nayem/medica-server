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

// Upload file attachments
const uploadAttachment = asyncHandler(async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    throw new AppError(400, "No files provided");
  }

  const uploadedFiles = await FileUploadHelper.uploadMultiple(
    files,
    {
      folderName: UploadFolder.CHAT_ATTACHMENTS,
      required: true,
      fieldLabel: "Attachments",
    },
  );

  if (!uploadedFiles || uploadedFiles.length === 0) {
    throw new AppError(400, "Upload failed");
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Files uploaded successfully",
    data: uploadedFiles.map((file) => ({
      url: file.secure_url,
      publicId: file.public_id,
      format: file.format,
      bytes: file.bytes,
      resourceType: file.resource_type,
    })),
  });
});

export const chatController = {
  getThreads,
  getThreadMessages,
  uploadAttachment,
};

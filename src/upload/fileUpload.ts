/* eslint-disable @typescript-eslint/no-explicit-any */
import multer, { FileFilterCallback } from "multer";
import { Request } from "express";
import AppError from "../errors/AppError";
import { AwsS3StorageProvider } from "./s3.provider";
import { CloudinaryStorageProvider } from "./cloudinary.provider";
import { IStorageProvider } from "./storage.interface";
import config from "../config";

// Folder Constants
export const UploadFolder = {
  PROFILE_IMAGES: "medica/profile-images",
  CHAT_ATTACHMENTS: "medica/chat-attachments",
  PRESCRIPTIONS: "medica/prescriptions",
  DOCUMENTS: "medica/documents",
} as const;

export type TUploadFolder = (typeof UploadFolder)[keyof typeof UploadFolder];

// Response Types
export interface UnifiedUploadResponse {
  url: string;
  key?: string;
  secure_url: string; // compatibility alias for url
  public_id: string; // compatibility alias for key
  format?: string;
  bytes?: number;
  resource_type?: string;
}

export interface UploadOptions {
  bucketName?: string;
  folderName?: string;
  required?: boolean;
  fieldLabel?: string;
}

// Allowed MIME types
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const DOCUMENT_TYPES = ["application/pdf"];
const ATTACHMENT_TYPES = [
  ...IMAGE_TYPES,
  ...DOCUMENT_TYPES,
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "audio/mpeg",
  "audio/ogg",
  "audio/webm",
  "video/mp4",
  "video/webm",
];

// File filters
const createFileFilter =
  (allowedTypes: string[]) =>
  (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          400,
          `Invalid file type: ${file.mimetype}. Allowed: ${allowedTypes.join(", ")}`,
        ) as unknown as null,
        false,
      );
    }
  };

// Multer setup
export const uploadImageMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: createFileFilter(IMAGE_TYPES),
});

export const uploadAttachmentMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: createFileFilter(ATTACHMENT_TYPES),
});

export const uploadDocumentMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: createFileFilter([...DOCUMENT_TYPES, "text/plain"]),
});

// Initialize storage providers
const s3StorageProvider = new AwsS3StorageProvider({
  region: config.aws.AWS_REGION,
  credentials: {
    accessKeyId: config.aws.AWS_ACCESS_KEY,
    secretAccessKey: config.aws.AWS_SECRET_KEY,
  },
  defaultBucketName: config.aws.AWS_S3_BUCKET_NAME,
});

// const cloudinaryStorageProvider = new CloudinaryStorageProvider({
//   cloudName: config.cloudinary.CLOUDINARY_CLOUD_NAME,
//   apiKey: config.cloudinary.CLOUDINARY_API_KEY,
//   apiSecret: config.cloudinary.CLOUDINARY_API_SECRET,
// });

const storageProvider: IStorageProvider = s3StorageProvider;

// Upload and delete handlers
const mapToUnifiedResponse = (
  result: any,
  file:
    | Express.Multer.File
    | { originalname: string; mimetype: string; buffer?: Buffer },
): UnifiedUploadResponse => {
  return {
    url: result.url,
    key: result.key,
    secure_url: result.url,
    public_id: result.key || "",
    format: result.format || file.originalname.split(".").pop() || "",
    bytes: result.bytes || (file.buffer ? file.buffer.length : 0),
    resource_type:
      result.resource_type || file.mimetype?.split("/")[0] || "raw",
  };
};

// Upload single file
const uploadSingle = async (
  file: Express.Multer.File | undefined,
  options?: UploadOptions,
): Promise<UnifiedUploadResponse | null> => {
  if (!file) {
    if (options?.required) {
      throw new AppError(400, `${options.fieldLabel || "File"} is required`);
    }
    return null;
  }
  const result = await storageProvider.uploadSingle(file, options);
  return mapToUnifiedResponse(result, file);
};

// Upload multiple files
const uploadMultiple = async (
  files: Express.Multer.File[],
  options?: UploadOptions,
): Promise<UnifiedUploadResponse[]> => {
  if (!files || files.length === 0) {
    throw new AppError(400, "No files provided");
  }
  const results = await storageProvider.uploadMultiple(files, options);
  return results.map((res, index) => mapToUnifiedResponse(res, files[index]));
};

// Upload PDF from buffer
const uploadPDFBuffer = async (
  pdfBuffer: Uint8Array,
  fileName: string,
  options?: UploadOptions,
): Promise<UnifiedUploadResponse> => {
  const result = await storageProvider.uploadPDFBuffer(
    pdfBuffer,
    fileName,
    options,
  );
  const fileDetails = {
    originalname: fileName,
    mimetype: "application/pdf",
    buffer: Buffer.from(pdfBuffer),
  };
  return mapToUnifiedResponse(result, fileDetails);
};

// Delete single file
const deleteSingle = async (
  fileUrlOrKey: string,
  options?: UploadOptions,
): Promise<void> => {
  return storageProvider.deleteSingle(fileUrlOrKey, options);
};

// Delete multiple files
const deleteMultiple = async (
  fileUrlsOrKeys: string[],
  options?: UploadOptions,
): Promise<void> => {
  return storageProvider.deleteMultiple(fileUrlsOrKeys, options);
};

export const FileUploadHelper = {
  uploadSingle,
  uploadMultiple,
  uploadPDFBuffer,
  deleteSingle,
  deleteMultiple,
};

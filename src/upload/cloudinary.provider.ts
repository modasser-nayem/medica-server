/* eslint-disable @typescript-eslint/no-explicit-any */
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { Readable } from "stream";
import AppError from "../errors/AppError";
import { FileObject, IStorageProvider, StorageOptions, UploadResponse } from "./storage.interface";

export interface CloudinaryProviderConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

const bufferToStream = (buffer: Buffer) => {
  const readable = new Readable();
  readable._read = () => {};
  readable.push(buffer);
  readable.push(null);
  return readable;
};

export class CloudinaryStorageProvider implements IStorageProvider {
  constructor(config: CloudinaryProviderConfig) {
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
    });
  }

  /**
   * Extract public_id from Cloudinary URL
   */
  private getPublicIdFromUrl(url: string): string {
    try {
      if (!url.startsWith("http")) {
        return url;
      }
      const parts = url.split("/");
      const uploadIndex = parts.findIndex((part) => part === "upload");
      if (uploadIndex === -1) throw new Error("Invalid Cloudinary URL");

      let publicIdParts = parts.slice(uploadIndex + 1);

      // Remove version if present (v123456789)
      if (
        publicIdParts[0].startsWith("v") &&
        /^\d+$/.test(publicIdParts[0].slice(1))
      ) {
        publicIdParts = publicIdParts.slice(1);
      }

      // Remove file extension
      const lastPart = publicIdParts.pop()!;
      const fileNameWithoutExt = lastPart.replace(/\.[^/.]+$/, "");
      publicIdParts.push(fileNameWithoutExt);

      return publicIdParts.join("/");
    } catch (error) {
      throw new AppError(400, "Cannot extract public_id from Cloudinary URL");
    }
  }

  public async uploadSingle(file: FileObject, options?: StorageOptions): Promise<UploadResponse> {
    try {
      if (!file) {
        throw new AppError(400, "File is required");
      }

      const folder = options?.folderName || "general";
      let uploadStream: Readable;

      if (file.path) {
        try {
          await fs.promises.access(file.path, fs.constants.F_OK);
          uploadStream = fs.createReadStream(file.path);
        } catch {
          throw new AppError(400, `File not found at path: ${file.path}`);
        }
      } else if (file.buffer) {
        uploadStream = bufferToStream(file.buffer);
      } else {
        throw new AppError(400, "Neither file path nor buffer is available");
      }

      return new Promise<UploadResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: "auto", folder },
          (error, result) => {
            if (error || !result) {
              console.error("Cloudinary upload error:", error);
              return reject(new AppError(500, "Failed to upload file to Cloudinary"));
            }
            resolve({
              url: result.secure_url,
              key: result.public_id,
              format: result.format,
              bytes: result.bytes,
              resource_type: result.resource_type,
            });
          },
        );
        uploadStream.pipe(stream);
      });
    } catch (error: any) {
      console.error("Cloudinary Upload Error:", error);
      throw error instanceof AppError ? error : new AppError(500, error?.message || "Failed to upload file");
    }
  }

  public async uploadMultiple(files: FileObject[], options?: StorageOptions): Promise<UploadResponse[]> {
    try {
      if (!files || files.length === 0) {
        throw new AppError(400, "Files are required");
      }

      const uploadPromises = files.map((file) => this.uploadSingle(file, options));
      return await Promise.all(uploadPromises);
    } catch (error: any) {
      console.error("Cloudinary Multiple Upload Error:", error);
      throw new AppError(500, error?.message || "Failed to upload files to Cloudinary");
    }
  }

  public async uploadPDFBuffer(
    pdfBuffer: Uint8Array,
    fileName: string,
    options?: StorageOptions,
  ): Promise<UploadResponse> {
    try {
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new AppError(400, "PDF buffer is empty");
      }

      const folder = options?.folderName || "pdf";
      const stream = bufferToStream(Buffer.from(pdfBuffer));

      return new Promise<UploadResponse>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: "raw", // raw for PDF, documents
            folder,
            public_id: fileName.replace(/\s+/g, "_"),
          },
          (error, result) => {
            if (error || !result) {
              console.error("Cloudinary PDF upload error:", error);
              return reject(new AppError(500, "Failed to upload PDF to Cloudinary"));
            }
            resolve({
              url: result.secure_url,
              key: result.public_id,
              format: result.format,
              bytes: result.bytes,
              resource_type: result.resource_type,
            });
          },
        );

        stream.pipe(uploadStream);
      });
    } catch (error: any) {
      console.error("Cloudinary PDF Upload Error:", error);
      throw error instanceof AppError ? error : new AppError(500, error?.message || "Failed to upload PDF");
    }
  }

  public async deleteSingle(fileUrlOrKey: string, options?: StorageOptions): Promise<void> {
    try {
      if (!fileUrlOrKey) {
        throw new AppError(400, "File URL or key is required");
      }

      const publicId = this.getPublicIdFromUrl(fileUrlOrKey);

      // Detect resource_type
      let resourceType: "image" | "raw" | "video" = "image"; // default
      if (fileUrlOrKey.includes("/raw/") || fileUrlOrKey.endsWith(".pdf") || fileUrlOrKey.endsWith(".doc") || fileUrlOrKey.endsWith(".docx")) {
        resourceType = "raw";
      } else if (fileUrlOrKey.includes("/video/") || fileUrlOrKey.endsWith(".mp4") || fileUrlOrKey.endsWith(".webm") || fileUrlOrKey.endsWith(".mp3")) {
        resourceType = "video";
      }

      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });

      if (result.result !== "ok" && result.result !== "not found") {
        throw new AppError(500, `Cloudinary delete failed: ${result.result}`);
      }
    } catch (error: any) {
      console.error("Cloudinary Delete Error:", error);
      throw error instanceof AppError ? error : new AppError(500, error?.message || "Failed to delete file");
    }
  }

  public async deleteMultiple(fileUrlsOrKeys: string[], options?: StorageOptions): Promise<void> {
    try {
      if (!Array.isArray(fileUrlsOrKeys) || fileUrlsOrKeys.length === 0) {
        throw new AppError(400, "No file URLs or keys provided");
      }

      await Promise.all(fileUrlsOrKeys.map((id) => this.deleteSingle(id, options)));
    } catch (error: any) {
      console.error("Cloudinary Multiple Delete Error:", error);
      throw new AppError(500, error?.message || "Failed to delete files");
    }
  }
}

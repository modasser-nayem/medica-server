/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import { Readable } from "stream";
import { v4 as uuid } from "uuid";
import AppError from "../errors/AppError";
import { FileObject, IStorageProvider, StorageOptions, UploadResponse } from "./storage.interface";

export interface S3ProviderConfig {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  defaultBucketName: string;
}

// Detect Content-Type from extension
const getContentType = (fileName: string, defaultType = "application/octet-stream") => {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext || ""] || defaultType;
};

export class AwsS3StorageProvider implements IStorageProvider {
  private client: S3Client;
  private defaultBucketName: string;
  private region: string;

  constructor(config: S3ProviderConfig) {
    this.client = new S3Client({
      region: config.region,
      credentials: config.credentials,
    });
    this.defaultBucketName = config.defaultBucketName;
    this.region = config.region;
  }

  /**
   * Helper: Generate pre-signed URL
   */
  public async generatePresignedUrl(
    key: string,
    bucketName: string,
    expiresInSeconds = 604800, // max 7 days
  ): Promise<string> {
    const contentType = getContentType(key);
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      ResponseContentDisposition: "inline",
      ResponseContentType: contentType,
    });

    return await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Helper: Extract S3 Key from URL or return the key if it already is one
   */
  private extractKeyFromUrl(url: string, bucketName: string): string {
    try {
      if (!url.startsWith("http")) {
        return url;
      }
      const parsedUrl = new URL(url);
      const host = parsedUrl.host;
      
      if (host.includes(`${bucketName}.s3`) || host.endsWith("amazonaws.com")) {
        // pathname starts with a slash, we want everything after it
        return decodeURIComponent(parsedUrl.pathname.substring(1));
      }
      
      throw new Error("URL host does not match S3 pattern");
    } catch (error) {
      if (!url.startsWith("http")) {
        return url;
      }
      throw new AppError(400, "Invalid S3 URL or key prefix");
    }
  }

  public async uploadSingle(file: FileObject, options?: StorageOptions): Promise<UploadResponse> {
    try {
      if (!file) {
        throw new AppError(400, "File is required");
      }

      const bucket = options?.bucketName || this.defaultBucketName;
      const folder = options?.folderName || "general";

      let fileBody: Buffer | Readable;

      if (file.path) {
        await fs.promises.access(file.path, fs.constants.F_OK);
        fileBody = fs.createReadStream(file.path);
      } else if (file.buffer) {
        fileBody = file.buffer;
      } else {
        throw new AppError(400, "Neither file path nor buffer is available");
      }

      const safeFileName = file.originalname.replace(/\s+/g, "-");
      const fileKey = `${folder}/${uuid()}-${safeFileName}`;
      const contentType = getContentType(safeFileName, file.mimetype);

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fileKey,
        Body: fileBody,
        ContentType: contentType,
        ContentDisposition: "inline",
      });

      await this.client.send(command);

      // Return pre-signed URL with "inline" view instruction
      const presignedUrl = await this.generatePresignedUrl(fileKey, bucket);

      return { url: presignedUrl, key: fileKey };
    } catch (error: any) {
      console.error("S3 Upload Error:", error);
      throw new AppError(500, error?.message || "Failed to upload file to S3");
    }
  }

  public async uploadMultiple(files: FileObject[], options?: StorageOptions): Promise<UploadResponse[]> {
    try {
      if (!files || files.length === 0) {
        throw new AppError(400, "Files are required");
      }

      const uploadPromises = files.map((file) => this.uploadSingle(file, options));
      const results = await Promise.all(uploadPromises);

      return results;
    } catch (error: any) {
      console.error("S3 Multiple Upload Error:", error);
      throw new AppError(500, error?.message || "Failed to upload files to S3");
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

      const bucket = options?.bucketName || this.defaultBucketName;
      const folder = options?.folderName || "pdf";

      const safeFileName = fileName.replace(/\s+/g, "-");
      const fileKey = `${folder}/${uuid()}-${safeFileName}.pdf`;

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fileKey,
        Body: pdfBuffer,
        ContentType: "application/pdf",
        ContentDisposition: "inline",
      });

      await this.client.send(command);

      const presignedUrl = await this.generatePresignedUrl(fileKey, bucket);
      return { url: presignedUrl, key: fileKey };
    } catch (error: any) {
      console.error("PDF S3 Upload Error:", error);
      throw new AppError(500, error?.message || "Failed to upload PDF to S3");
    }
  }

  public async deleteSingle(fileUrlOrKey: string, options?: StorageOptions): Promise<void> {
    try {
      if (!fileUrlOrKey) {
        throw new AppError(400, "File URL or Key is required");
      }

      const bucket = options?.bucketName || this.defaultBucketName;
      const key = this.extractKeyFromUrl(fileUrlOrKey, bucket);

      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.client.send(command);
    } catch (error: any) {
      console.error("S3 Delete Error:", error);
      throw new AppError(500, error?.message || "Failed to delete file from S3");
    }
  }

  public async deleteMultiple(fileUrlsOrKeys: string[], options?: StorageOptions): Promise<void> {
    try {
      if (!Array.isArray(fileUrlsOrKeys) || fileUrlsOrKeys.length === 0) {
        throw new AppError(400, "No file URLs or keys provided");
      }

      const bucket = options?.bucketName || this.defaultBucketName;
      const objectKeys = fileUrlsOrKeys.map((urlOrKey) => ({
        Key: this.extractKeyFromUrl(urlOrKey, bucket),
      }));

      const command = new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: objectKeys },
      });

      await this.client.send(command);
    } catch (error: any) {
      console.error("S3 Multiple Delete Error:", error);
      throw new AppError(500, error?.message || "Failed to delete files from S3");
    }
  }
}

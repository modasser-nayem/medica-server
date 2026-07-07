export interface FileObject {
  originalname: string;
  path?: string;
  buffer?: Buffer;
  mimetype: string;
}

export interface UploadResponse {
  url: string;
  key?: string; // S3 object key or Cloudinary public_id
  format?: string;
  bytes?: number;
  resource_type?: string;
}

export interface StorageOptions {
  bucketName?: string; // S3 bucket override
  folderName?: string; // target folder/prefix
}

export interface IStorageProvider {
  /**
   * Uploads a single file to the storage provider
   */
  uploadSingle(file: FileObject, options?: StorageOptions): Promise<UploadResponse>;

  /**
   * Uploads multiple files to the storage provider
   */
  uploadMultiple(files: FileObject[], options?: StorageOptions): Promise<UploadResponse[]>;

  /**
   * Uploads a raw PDF buffer to the storage provider
   */
  uploadPDFBuffer(
    pdfBuffer: Uint8Array,
    fileName: string,
    options?: StorageOptions,
  ): Promise<UploadResponse>;

  /**
   * Deletes a single file from the storage provider using its URL or Key
   */
  deleteSingle(fileUrlOrKey: string, options?: StorageOptions): Promise<void>;

  /**
   * Deletes multiple files from the storage provider
   */
  deleteMultiple(fileUrlsOrKeys: string[], options?: StorageOptions): Promise<void>;
}

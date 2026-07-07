import dotenv from "dotenv";
import path from "path";
import { envRequireNumber, envRequireString } from "../utils/envValidate";

const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
dotenv.config({ path: path.join(process.cwd(), envFile) });

export default {
  NODE_ENV: envRequireString("NODE_ENV"),
  PORT: envRequireNumber("PORT"),
  CORS_ORIGIN: envRequireString("CORS_ORIGIN"),
  DATABASE_URL: envRequireString("DATABASE_URL"),
  FRONTEND_URL: envRequireString("FRONTEND_URL"),
  BCRYPT_SALT_ROUNDS: envRequireNumber("BCRYPT_SALT_ROUNDS"),
  OTP_EXPIRES_IN: envRequireNumber("OTP_EXPIRES_IN"),

  SUPER_ADMIN_EMAIL: envRequireString("SUPER_ADMIN_EMAIL"),

  oauth: {
    google: {
      GOOGLE_CLIENT_ID: envRequireString("GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET: envRequireString("GOOGLE_CLIENT_SECRET"),
    },
  },

  cloudinary: {
    CLOUDINARY_CLOUD_NAME: envRequireString("CLOUDINARY_CLOUD_NAME"),
    CLOUDINARY_API_KEY: envRequireString("CLOUDINARY_API_KEY"),
    CLOUDINARY_API_SECRET: envRequireString("CLOUDINARY_API_SECRET"),
  },

  aws: {
    AWS_ACCESS_KEY: envRequireString("AWS_ACCESS_KEY"),
    AWS_SECRET_KEY: envRequireString("AWS_SECRET_KEY"),
    AWS_REGION: envRequireString("AWS_REGION"),
    AWS_S3_BUCKET_NAME: envRequireString("AWS_S3_BUCKET_NAME"),
  },

  token: {
    ACCESS_TOKEN_SECRET: envRequireString("ACCESS_TOKEN_SECRET"),
    ACCESS_EXPIRES_IN: envRequireString("ACCESS_EXPIRES_IN"),
    REFRESH_TOKEN_SECRET: envRequireString("REFRESH_TOKEN_SECRET"),
    REFRESH_EXPIRES_IN: envRequireString("REFRESH_EXPIRES_IN"),
  },

  stripe: {
    STRIPE_SECRET_KEY: envRequireString("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: envRequireString("STRIPE_WEBHOOK_SECRET"),
  },

  mail: {
    SMTP_HOST: envRequireString("SMTP_HOST"),
    SMTP_PORT: envRequireNumber("SMTP_PORT"),
    SMTP_USER: envRequireString("SMTP_USER"),
    SMTP_APP_PASS: envRequireString("SMTP_APP_PASS"),
    SMTP_FROM: envRequireString("SMTP_FROM"),
    SMTP_SUPPORT_MAIL: envRequireString("SMTP_SUPPORT_MAIL"),
  },

  agora: {
    APP_ID: envRequireString("AGORA_APP_ID"),
    APP_CERTIFICATE: envRequireString("AGORA_APP_CERTIFICATE"),
  },
};

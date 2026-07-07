import config from "../config";

export const APP_CONFIG = {
  APP_NAME: "Medica",
  DOMAIN: "https://medica-health.vercel.app",
  WWW_DOMAIN: "www.medica-health.vercel.app",
  SUPPORT_EMAIL: config.mail.SMTP_SUPPORT_MAIL,
  COPYRIGHT_LINE: `&copy; ${new Date().getFullYear()} Medica. All rights reserved.`,
};

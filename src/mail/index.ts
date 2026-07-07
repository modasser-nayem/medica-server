import config from "../config";
import nodemailer from "nodemailer";
import { APP_CONFIG } from "../constants/constants";
import logger from "../utils/logger";
import { accountCreationEmail } from "./template/accountCreation";
import { resetPasswordHtml as forgotPasswordEmail } from "./template/resetPassword";

const mailTemplate = {
  accountCreationEmail,
  forgotPasswordEmail,
};

const transporter = nodemailer.createTransport({
  host: config.mail.SMTP_HOST,
  port: config.mail.SMTP_PORT,
  secure: true,
  auth: {
    user: config.mail.SMTP_USER,
    pass: config.mail.SMTP_APP_PASS,
  },
});

const sendEmail = async (data: {
  to: string;
  subject: string;
  html?: string;
  htmlTemplate?: string;
}) => {
  const htmlContent = data.html || data.htmlTemplate || "";
  const info = await transporter.sendMail({
    from: `${APP_CONFIG.APP_NAME} <${config.mail.SMTP_FROM}>`,
    to: data.to,
    subject: data.subject,
    html: htmlContent,
  });

  logger.info(`Email sent to ${data.to} | Message ID: ${info.messageId}`);
};

export const emailHelper = { sendEmail, mailTemplate };

import { APP_CONFIG } from "../../constants/constants";

export const emailVerification = (otp: number, expireMinute: number) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Verification</title>
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; color: #1f2937;">
    <div style="max-width: 450px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
        <h2 style="color: #bf774c; margin-top: 0; font-size: 20px; font-weight: 600; text-align: center;">Verify Your Email Address</h2>
        <p style="font-size: 15px; line-height: 1.5; color: #4b5563; text-align: center; margin: 16px 0 24px;">
            Please enter the following 6-digit verification code to complete the signup:
        </p>
        <div style="text-align: center; margin: 24px 0;">
            <div style="display: inline-block; font-size: 32px; font-weight: 700; color: #111827; letter-spacing: 6px; background-color: #f3f4f6; border-radius: 8px; padding: 12px 24px; border: 1px solid #e5e7eb;">
                ${otp}
            </div>
        </div>
        <p style="font-size: 13px; color: #6b7280; text-align: center; margin: 24px 0 0;">
            This code will expire in <strong>${expireMinute} minutes</strong>.<br>
            If you did not request this email, you can safely ignore it.
        </p>
        <hr style="border: 0; border-top: 1px solid #f3f4f6; margin: 24px 0;">
        <div style="text-align: center; font-size: 12px; color: #9ca3af;">
            <p style="margin: 0 0 4px;">Support: <a href="mailto:${APP_CONFIG.SUPPORT_EMAIL}" style="color: #bf774c; text-decoration: none;">${APP_CONFIG.SUPPORT_EMAIL}</a></p>
            <p style="margin: 0;"><a href="${APP_CONFIG.DOMAIN}" style="color: #9ca3af; text-decoration: none;">${APP_CONFIG.WWW_DOMAIN}</a></p>
        </div>
    </div>
</body>
</html>`;
};

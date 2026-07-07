import { APP_CONFIG } from "../../constants/constants";

export const accountCreationEmail = (userName: string) => {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background: #f7f7f7;">
    <div style="background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <div style="background-color: #003366; padding: 20px; color: white; text-align: center;">
        <h2 style="margin: 10px 0;">${APP_CONFIG.APP_NAME}</h2>
      </div>
      <div style="padding: 20px;">
        <h3>Hello ${userName},</h3>
        <p>Welcome to our ${APP_CONFIG.WWW_DOMAIN}! Your account has been successfully created.</p>
        <p>Now you can easily use the application.</p>
        <p>Thank You!</p>
      </div>
      <div style="background: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        ${APP_CONFIG.COPYRIGHT_LINE}
      </div>
    </div>
  </div>
`;
};

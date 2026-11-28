import { escapeHtml, sanitizeHttpUrl } from "../utils/emailSanitizer.js";

const resetPasswordTemplate = ({
  resetUrl,
  firstName,
}) => {
  const safeName = escapeHtml(firstName || "there") || "there";
  const safeResetUrl = sanitizeHttpUrl(resetUrl, "#");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 12px 40px rgba(15,23,42,0.08);">
          <tr>
            <td style="padding:34px 30px 42px;text-align:center;background:linear-gradient(135deg,#312e81 0%,#4f46e5 50%,#6366f1 100%);">
              <div style="width:64px;height:64px;margin:0 auto 18px;border-radius:18px;background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.25);line-height:64px;text-align:center;font-size:28px;color:#ffffff;font-weight:700;">
                W
              </div>
              <div style="color:#ffffff;font-size:25px;font-weight:700;letter-spacing:-0.5px;">
                WorkComposer
              </div>
              <div style="margin-top:8px;color:rgba(255,255,255,0.78);font-size:13px;">
                Password Recovery
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:42px 38px 36px;">
              <h1 style="margin:0;text-align:center;color:#111827;font-size:28px;line-height:1.25;letter-spacing:-0.6px;font-weight:750;">
                Reset your password
              </h1>
              <p style="margin:16px auto 0;max-width:480px;text-align:center;color:#6b7280;font-size:15px;line-height:1.7;">
                Hi <strong style="color:#374151;">${safeName}</strong>, we received a request to reset your WorkComposer account password.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:30px;border-radius:16px;background:#f8fafc;border:1px solid #e5e7eb;overflow:hidden;">
                <tr>
                  <td align="center" style="padding:28px 20px;">
                    <div style="color:#374151;font-size:14px;font-weight:700;">
                      Choose a new password
                    </div>
                    <div style="margin-top:6px;color:#9ca3af;font-size:12px;">
                      Click the button below to continue resetting your password.
                    </div>
                    <div style="margin-top:22px;">
                      <a href="${safeResetUrl}" target="_blank" style="display:inline-block;padding:14px 30px;border-radius:10px;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;box-shadow:0 8px 20px rgba(79,70,229,0.25);">
                        Reset Password &rarr;
                      </a>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0;text-align:center;color:#9ca3af;font-size:12px;line-height:1.6;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:7px auto 0;max-width:500px;text-align:center;word-break:break-all;font-size:12px;">
                <a href="${safeResetUrl}" style="color:#4f46e5;text-decoration:none;">
                  ${safeResetUrl}
                </a>
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border-radius:14px;background:#fffbeb;border:1px solid #fde68a;">
                <tr>
                  <td style="padding:16px 18px;color:#92400e;font-size:12px;line-height:1.6;">
                    <strong>Security notice:</strong> This password reset link expires in 15 minutes. If you did not request a password reset, you can safely ignore this email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 30px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:12px;">
              This email was sent automatically by WorkComposer.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export default resetPasswordTemplate;


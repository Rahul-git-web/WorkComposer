import dotenv from "dotenv";
dotenv.config();

import { BrevoClient } from "@getbrevo/brevo";
import { sanitizeHeaderText } from "./emailSanitizer.js";

const DEFAULT_BREVO_TIMEOUT_SECONDS = 15;

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
  timeoutInSeconds: DEFAULT_BREVO_TIMEOUT_SECONDS,
});

function sanitizeHeadersMap(headers = {}) {
  const sanitized = {};
  for (const [key, value] of Object.entries(headers)) {
    const cleanKey = sanitizeHeaderText(key);
    if (!cleanKey || value === undefined || value === null) {
      continue;
    }
    sanitized[cleanKey] = typeof value === "string" ? sanitizeHeaderText(value) : value;
  }
  return sanitized;
}

/**
 * Builds the exact request payload expected by Brevo v3 transactional email API.
 * Places idempotencyKey inside headers object as specified by Brevo API.
 *
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML email body
 * @param {Object} [options] - Additional options
 * @param {string} [options.idempotencyKey] - UUIDv4 idempotency key
 * @param {Object} [options.headers] - Additional custom headers
 * @returns {Object} Brevo SendTransacEmailRequest payload
 */
export function buildBrevoEmailPayload(to, subject, html, options = {}) {
  const cleanTo = sanitizeHeaderText(to);
  const cleanSubject = sanitizeHeaderText(subject);
  const cleanSenderEmail =
    sanitizeHeaderText(process.env.EMAIL_FROM || "noreply@workcomposer.com") ||
    "noreply@workcomposer.com";

  const payload = {
    sender: {
      name: "WorkComposer",
      email: cleanSenderEmail,
    },
    to: [
      {
        email: cleanTo,
      },
    ],
    subject: cleanSubject,
    htmlContent: html,
  };

  // Brevo v3 transactional email API specifies idempotencyKey within headers object of JSON payload
  if (options.idempotencyKey) {
    payload.headers = {
      idempotencyKey: sanitizeHeaderText(options.idempotencyKey),
      ...sanitizeHeadersMap(options.headers || {}),
    };
  } else if (options.headers) {
    payload.headers = sanitizeHeadersMap(options.headers);
  }

  return payload;
}

/**
 * Sends a transactional email with support for provider idempotency keys.
 *
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} html - HTML content body
 * @param {Object} [options] - Additional provider options
 * @param {string} [options.idempotencyKey] - UUIDv4 idempotency key for deduplication
 * @param {number} [options.timeoutInSeconds] - Optional provider request timeout override
 * @param {AbortSignal} [options.abortSignal] - Optional AbortSignal for provider request
 * @param {number} [options.mockDelayMs] - Simulated latency for testing
 * @param {Error} [options.mockError] - Simulated error for testing
 * @param {string} [options.mockMessageId] - Custom mock messageId
 * @param {Object} [options.brevoClient] - Custom BrevoClient for mock HTTP transport testing
 * @param {boolean} [options.useLiveOrMockClient] - Force using brevoClient even if MOCK_EMAIL_SERVICE is true
 * @returns {Promise<{ messageId: string, alreadyDelivered?: boolean, idempotencyKey?: string }>}
 */
const sendEmail = async (to, subject, html, options = {}) => {
  if (process.env.MOCK_EMAIL_SERVICE === "true" && !options.useLiveOrMockClient) {
    if (options.mockDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.mockDelayMs));
    }
    if (options.mockError) {
      throw options.mockError;
    }
    return {
      messageId: options.mockMessageId || `mock_email_${Date.now()}`,
      idempotencyKey: options.idempotencyKey || null,
    };
  }

  const cleanTo = sanitizeHeaderText(to);
  if (!cleanTo) {
    throw new Error("Recipient email address is required");
  }

  if (!options.brevoClient && !process.env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY is required when MOCK_EMAIL_SERVICE is disabled");
  }

  try {
    const payload = buildBrevoEmailPayload(cleanTo, subject, html, options);
    const client = options.brevoClient || brevo;

    const requestOptions =
      options.timeoutInSeconds !== undefined || options.abortSignal
        ? {
            ...(options.timeoutInSeconds !== undefined
              ? { timeoutInSeconds: options.timeoutInSeconds }
              : {}),
            ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
          }
        : undefined;

    const response = requestOptions
      ? await client.transactionalEmails.sendTransacEmail(payload, requestOptions)
      : await client.transactionalEmails.sendTransacEmail(payload);

    console.log("BREVO EMAIL SENT:", response.messageId || response.data?.messageId);

    return {
      messageId: response.messageId || response.data?.messageId || "sent",
      idempotencyKey: options.idempotencyKey || null,
      ...response,
    };
  } catch (err) {
    // Check across Brevo BadRequestError, Axios response data, and generic error messages
    const errCode = err?.code || err?.body?.code || err?.response?.body?.code || err?.response?.data?.code;
    const errMsg = String(err?.message || "") + " " + JSON.stringify(err?.body || {});
    if (
      errCode === "duplicate_parameter" ||
      errMsg.includes("duplicate_parameter") ||
      errMsg.includes("idempotency")
    ) {
      console.warn(
        `[SendEmail] Brevo recognized duplicate idempotency key ${options.idempotencyKey}. Message already accepted.`,
      );
      return {
        messageId: "brevo_duplicate_parameter_acknowledged",
        alreadyDelivered: true,
        idempotencyKey: options.idempotencyKey || null,
      };
    }

    console.error("BREVO EMAIL ERROR:", err);

    throw err;
  }
};

export default sendEmail;

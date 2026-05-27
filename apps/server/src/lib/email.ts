/**
 * Email service using Resend
 *
 * Handles sending transactional emails for:
 * - Password reset requests
 * - Contact form submissions
 *
 * Configuration via environment variables:
 * - RESEND_API_KEY: Resend API key
 * - EMAIL_FROM: Sender email address (e.g., noreply@moltverse.social)
 * - CONTACT_EMAIL: Contact form recipient (e.g., contact@moltverse.social)
 * - FRONTEND_URL: Frontend URL for building links
 */

import { Resend } from 'resend';
import { trackResendCall } from './external-service-metrics.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@moltverse.social';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'contact@moltverse.social';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Lazy initialization of Resend client
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * Check if email service is configured
 */
export function isEmailServiceConfigured(): boolean {
  return !!RESEND_API_KEY;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Mask an email address for safe logging (SEC-012).
 * "alice@example.com" → "a***@example.com"
 */
function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return '***';
  return `${email[0]}***${email.slice(atIndex)}`;
}

/**
 * Escape HTML entities to prevent injection in email templates.
 * Critical for user-controlled values like displayName (from Twitter).
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

/**
 * Generate email verification email HTML with 8-digit code
 */
function getEmailVerificationEmailHtml(code: string, displayName: string): string {
  const safeDisplayName = escapeHtml(displayName);
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Verification Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: #ec2d7a; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Moltverse</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
                Your Verification Code
              </h2>

              <p style="margin: 0 0 24px 0; color: #4a4a4a; font-size: 16px; line-height: 1.5;">
                Hi ${safeDisplayName},
              </p>

              <p style="margin: 0 0 24px 0; color: #4a4a4a; font-size: 16px; line-height: 1.5;">
                Enter this code to verify your email address:
              </p>

              <!-- Code Display -->
              <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                <tr>
                  <td style="padding: 16px 0 24px 0; text-align: center;">
                    <div style="display: inline-block; padding: 20px 40px; background-color: #f8f9fa; border: 2px dashed #ec2d7a; border-radius: 8px;">
                      <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1a1a1a; font-family: 'Courier New', monospace;">
                        ${code}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px 0; color: #6a6a6a; font-size: 14px; line-height: 1.5; text-align: center;">
                This code will expire in <strong>15 minutes</strong>.
              </p>

              <p style="margin: 0; color: #6a6a6a; font-size: 14px; line-height: 1.5; text-align: center;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9f9f9; text-align: center;">
              <p style="margin: 0; color: #9a9a9a; font-size: 12px;">
                Moltverse - Orkut for agents.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}

/**
 * Generate email verification email plain text with 8-digit code
 */
function getEmailVerificationEmailText(code: string, displayName: string): string {
  return `
Hi ${displayName},

Your verification code is: ${code}

Enter this code on Moltverse to verify your email address.

This code will expire in 15 minutes.

If you didn't request this, you can safely ignore this email.

---
Moltverse - Orkut for agents.
`.trim();
}

/**
 * Generate password reset email HTML
 */
function getPasswordResetEmailHtml(resetUrl: string, displayName: string): string {
  const safeDisplayName = escapeHtml(displayName);
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: #ec2d7a; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Moltverse</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
                Reset Your Password
              </h2>

              <p style="margin: 0 0 24px 0; color: #4a4a4a; font-size: 16px; line-height: 1.5;">
                Hi ${safeDisplayName},
              </p>

              <p style="margin: 0 0 24px 0; color: #4a4a4a; font-size: 16px; line-height: 1.5;">
                We received a request to reset the password for your Moltverse observer account. Click the button below to create a new password:
              </p>

              <!-- Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                <tr>
                  <td style="padding: 8px 0 24px 0;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background-color: #ec2d7a; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 6px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px 0; color: #6a6a6a; font-size: 14px; line-height: 1.5;">
                This link will expire in 1 hour for security reasons.
              </p>

              <p style="margin: 0 0 16px 0; color: #6a6a6a; font-size: 14px; line-height: 1.5;">
                If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>

              <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />

              <p style="margin: 0; color: #9a9a9a; font-size: 12px; line-height: 1.5;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin: 8px 0 0 0; color: #ec2d7a; font-size: 12px; line-height: 1.5; word-break: break-all;">
                ${resetUrl}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9f9f9; text-align: center;">
              <p style="margin: 0; color: #9a9a9a; font-size: 12px;">
                Moltverse - Orkut for agents.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}

/**
 * Generate password reset email plain text
 */
function getPasswordResetEmailText(resetUrl: string, displayName: string): string {
  return `
Hi ${displayName},

We received a request to reset the password for your Moltverse observer account.

Click the link below to create a new password:
${resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.

---
Moltverse - Orkut for agents.
`.trim();
}

/**
 * Generate contact form notification email HTML
 */
function getContactFormEmailHtml(name: string, email: string, message: string): string {
  const escapedName = escapeHtml(name);
  const escapedEmail = escapeHtml(email);
  const escapedMessage = escapeHtml(message).replace(/\n/g, '<br>');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Contact Form Submission</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: #3b82f6; padding: 24px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">New Contact Form Submission</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 40px;">
              <!-- Sender Info -->
              <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px; background-color: #f8fafc; border-radius: 6px;">
                    <p style="margin: 0 0 8px 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">From</p>
                    <p style="margin: 0; color: #1e293b; font-size: 16px; font-weight: 500;">${escapedName}</p>
                    <p style="margin: 4px 0 0 0; color: #3b82f6; font-size: 14px;">
                      <a href="mailto:${escapedEmail}" style="color: #3b82f6; text-decoration: none;">${escapedEmail}</a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Message -->
              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 12px 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Message</p>
                <div style="padding: 16px; background-color: #f8fafc; border-radius: 6px; border-left: 4px solid #3b82f6;">
                  <p style="margin: 0; color: #334155; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${escapedMessage}</p>
                </div>
              </div>

              <!-- Reply Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                <tr>
                  <td>
                    <a href="mailto:${escapedEmail}?subject=Re: Your message to Moltverse" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 6px;">
                      Reply to ${escapedName}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f8fafc; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                This email was sent from the Moltverse contact form.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}

/**
 * Generate contact form notification email plain text
 */
function getContactFormEmailText(name: string, email: string, message: string): string {
  return `
NEW CONTACT FORM SUBMISSION
============================

From: ${name}
Email: ${email}

Message:
--------
${message}

---
Reply directly to this email or to: ${email}
`.trim();
}

// ============================================================================
// EMAIL FUNCTIONS
// ============================================================================

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

/**
 * Send password reset email
 *
 * @param email - Recipient email address
 * @param resetToken - The reset token (will be appended to URL)
 * @param displayName - User's display name for personalization
 */
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  displayName: string
): Promise<SendEmailResult> {
  // Check if email service is configured
  if (!isEmailServiceConfigured()) {
    console.warn('[Email] Resend not configured. Skipping email send.');
    return { success: false, error: 'Email service not configured' };
  }

  const resetUrl = `${FRONTEND_URL}/reset-password/${resetToken}`;

  try {
    const resend = getResendClient();

    const { error } = await resend.emails.send({
      from: `Moltverse <${EMAIL_FROM}>`,
      to: email,
      subject: 'Reset Your Password - Moltverse',
      html: getPasswordResetEmailHtml(resetUrl, displayName),
      text: getPasswordResetEmailText(resetUrl, displayName),
    });

    if (error) {
      console.error('[Email] Failed to send password reset email:', error);
      trackResendCall(error.message);
      return { success: false, error: error.message };
    }

    // Track successful email
    trackResendCall();

    console.log(`[Email] Password reset email sent to ${maskEmail(email)}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Email] Error sending password reset email:', message);
    trackResendCall(message);
    return { success: false, error: message };
  }
}

/**
 * Send contact form notification email
 *
 * Sends the contact form submission to the Moltverse team.
 * Uses reply-to header so the team can respond directly to the sender.
 *
 * @param senderName - Name of the person submitting the form
 * @param senderEmail - Email of the person (used for reply-to)
 * @param message - The message content
 */
export async function sendContactFormEmail(
  senderName: string,
  senderEmail: string,
  message: string
): Promise<SendEmailResult> {
  // Check if email service is configured
  if (!isEmailServiceConfigured()) {
    console.warn('[Email] Resend not configured. Skipping contact form email.');
    return { success: false, error: 'Email service not configured' };
  }

  // Truncate name for subject if too long
  const truncatedName = senderName.length > 30 ? `${senderName.slice(0, 27)}...` : senderName;
  const subject = `Contact Form: ${truncatedName}`;

  // Extract email address from EMAIL_FROM (handles both "email" and "Name <email>" formats)
  const emailMatch = EMAIL_FROM.match(/<(.+)>/) || [null, EMAIL_FROM];
  const fromEmail = emailMatch[1] || EMAIL_FROM;

  try {
    const resend = getResendClient();

    const { error } = await resend.emails.send({
      from: `Moltverse Contact <${fromEmail}>`,
      to: CONTACT_EMAIL,
      replyTo: senderEmail,
      subject,
      html: getContactFormEmailHtml(senderName, senderEmail, message),
      text: getContactFormEmailText(senderName, senderEmail, message),
    });

    if (error) {
      console.error('[Email] Failed to send contact form email:', error);
      trackResendCall(error.message);
      return { success: false, error: error.message };
    }

    // Track successful email
    trackResendCall();

    console.log(`[Email] Contact form email sent from ${maskEmail(senderEmail)}`);
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Email] Error sending contact form email:', errorMessage);
    trackResendCall(errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send email verification email with 8-digit code
 *
 * @param email - Recipient email address
 * @param code - The 8-digit verification code
 * @param displayName - User's display name for personalization
 */
export async function sendEmailVerificationEmail(
  email: string,
  code: string,
  displayName: string
): Promise<SendEmailResult> {
  // Check if email service is configured
  if (!isEmailServiceConfigured()) {
    console.warn('[Email] Resend not configured. Skipping verification email.');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const resend = getResendClient();

    const { error } = await resend.emails.send({
      from: `Moltverse <${EMAIL_FROM}>`,
      to: email,
      subject: 'Your Verification Code - Moltverse',
      html: getEmailVerificationEmailHtml(code, displayName),
      text: getEmailVerificationEmailText(code, displayName),
    });

    if (error) {
      console.error('[Email] Failed to send verification email:', error);
      trackResendCall(error.message);
      return { success: false, error: error.message };
    }

    // Track successful email
    trackResendCall();

    console.log(`[Email] Verification code sent to ${maskEmail(email)}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Email] Error sending verification email:', message);
    trackResendCall(message);
    return { success: false, error: message };
  }
}

/**
 * Send brand email verification email with 8-digit code
 *
 * Uses the same template as observer email verification.
 *
 * @param email - Brand's email address
 * @param code - The 8-digit verification code
 * @param brandName - Brand's display name for personalization
 */
export async function sendBrandVerificationEmail(
  email: string,
  code: string,
  brandName: string
): Promise<SendEmailResult> {
  // Check if email service is configured
  if (!isEmailServiceConfigured()) {
    console.warn('[Email] Resend not configured. Skipping brand verification email.');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const resend = getResendClient();

    const { error } = await resend.emails.send({
      from: `Moltverse <${EMAIL_FROM}>`,
      to: email,
      subject: 'Verify Your Brand Account - Moltverse',
      html: getEmailVerificationEmailHtml(code, brandName),
      text: getEmailVerificationEmailText(code, brandName),
    });

    if (error) {
      console.error('[Email] Failed to send brand verification email:', error);
      trackResendCall(error.message);
      return { success: false, error: error.message };
    }

    // Track successful email
    trackResendCall();

    console.log(`[Email] Brand verification code sent to ${maskEmail(email)}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Email] Error sending brand verification email:', message);
    trackResendCall(message);
    return { success: false, error: message };
  }
}

/**
 * Send beta invite email — Fase 9.
 *
 * Composes the welcome template via `renderWelcomeEmail` and ships it
 * through Resend. Mirrors the failure semantics of the other senders:
 * never throws; an unconfigured Resend, a bad recipient, or a Resend
 * API error all surface as `{ success: false, error }` so the caller
 * (admin route + CLI) can persist the code AND report the dispatch
 * outcome in a single response — the operator sees the code even when
 * the email failed. The DB row is the source of truth.
 *
 * @param to        - Recipient address. Light shape-check below; the
 *                    admin route + Zod schema already validate.
 * @param code      - Canonical invite code (MOLT-XXXX-XXXX-XXXX).
 * @param claimUrl  - Fully-qualified claim URL. Must be http(s);
 *                    `renderWelcomeEmail` enforces.
 * @param options   - Optional `fromName` + `cohort` for personalisation.
 */
export async function sendBetaInviteEmail(
  to: string,
  code: string,
  claimUrl: string,
  options: { fromName?: string; cohort?: string } = {}
): Promise<SendEmailResult> {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_REGEX.test(to)) {
    return { success: false, error: 'Recipient address is not a valid email' };
  }
  if (!isEmailServiceConfigured()) {
    console.warn('[Email] Resend not configured. Skipping beta invite email.');
    return { success: false, error: 'Email service not configured' };
  }

  // `renderWelcomeEmail` throws on non-http(s) `claimUrl` (defence
  // against javascript:/data: scheme injection). The admin routes
  // build claimUrl from a hardcoded PUBLIC_BASE_URL so a throw is a
  // caller bug — catch and surface as structured failure anyway.
  // Lazy-import so the email-template module isn't eagerly resolved
  // when sendBetaInviteEmail isn't used (matches the pattern of other
  // template imports in this file).
  let rendered;
  try {
    const { renderWelcomeEmail } = await import('./invites/welcome-email.js');
    rendered = renderWelcomeEmail({
      code,
      claimUrl,
      ...(options.fromName !== undefined ? { fromName: options.fromName } : {}),
      ...(options.cohort !== undefined ? { cohort: options.cohort } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown render error';
    return { success: false, error: `Template render failed: ${message}` };
  }

  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: `Moltverse <${EMAIL_FROM}>`,
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (error) {
      console.error('[Email] Failed to send beta invite email:', error);
      trackResendCall(error.message);
      return { success: false, error: error.message };
    }
    trackResendCall();
    console.log(`[Email] Beta invite ${code} sent to ${maskEmail(to)}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Email] Error sending beta invite email:', message);
    trackResendCall(message);
    return { success: false, error: message };
  }
}

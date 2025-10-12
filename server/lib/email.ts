import { createMimeMessage, MIMEMessage, type MailboxAddrObject } from 'mimetext';
import type { Context } from '../trpc';
import { EmailMessage } from 'cloudflare:email';
import { nanoid } from 'nanoid';
import { emailCodesTable } from '../../db/schema';
import { addSeconds } from 'date-fns';
import { and, eq, gt } from 'drizzle-orm';

type Recipient = MailboxAddrObject & {
  name: string;
  addr: string;
};

export function createBaseMessage(ctx: Context, recipient: Recipient, subject: string) {
  const { env } = ctx;
  const msg = createMimeMessage();
  msg.setSender({ name: env.EMAIL_SENDER_NAME, addr: env.EMAIL_SENDER_ADDR });
  msg.setRecipient(recipient);
  msg.setSubject(subject);

  return msg;
}

export function sendEmail(ctx: Context, recipient: Recipient, msg: MIMEMessage) {
  const { env } = ctx;
  const email = new EmailMessage(env.EMAIL_SENDER_ADDR, recipient.addr, msg.asRaw());
  return env.email.send(email);
}

export function addTextAndHtml(msg: MIMEMessage, text: string, html: string) {
  msg.addMessage({ data: text, contentType: 'text/plain', charset: 'utf-8' });
  msg.addMessage({ data: html, contentType: 'text/html', charset: 'utf-8' });
  return msg;
}

export function sendSignUpVerificationEmail(ctx: Context, recipient: Recipient, verificationLink: string) {
  const msg = createBaseMessage(ctx, recipient, 'Verify Your Email Address');

  const text = `Hi ${recipient.name},

Thank you for signing up! Please verify your email address by clicking the link below:

${verificationLink}

If you did not sign up, please ignore this email.

Cheers,
Perfin System`;

  const html = `<p>Hi ${recipient.name},</p>
<p>Thank you for signing up! Please verify your email address by clicking the link below:</p>
<p><a href="${verificationLink}">Verify Email</a></p>
<p>If you did not sign up, please ignore this email.</p>
<p>Cheers,<br>Perfin System</p>`;

  return sendEmail(ctx, recipient, addTextAndHtml(msg, text, html));
}

export function sendSignInAlertEmail(
  ctx: Context,
  recipient: Recipient,
  ipAddress: string,
  location: string,
  dateTime: string,
) {
  const msg = createBaseMessage(ctx, recipient, 'New Sign-in Detected');

  const text = `Hi ${recipient.name},

We noticed a sign-in to your account from a new location:

IP Address: ${ipAddress}
Location: ${location}
Time: ${dateTime}

If this was you, no action is needed. If not, please secure your account immediately.

Cheers,
Perfin System`;

  const html = `<p>Hi ${recipient.name},</p>
<p>We noticed a sign-in to your account from a new location:</p>
<ul>
<li><strong>IP Address:</strong> ${ipAddress}</li>
<li><strong>Location:</strong> ${location}</li>
<li><strong>Time:</strong> ${dateTime}</li>
</ul>
<p>If this was you, no action is needed. If not, please secure your account immediately.</p>
<p>Cheers,<br>Perfin System</p>`;

  return sendEmail(ctx, recipient, addTextAndHtml(msg, text, html));
}

export function sendForgotPasswordEmail(ctx: Context, recipient: Recipient, resetLink: string) {
  const msg = createBaseMessage(ctx, recipient, 'Password Reset Request');

  const text = `Hi ${recipient.name},

We received a request to reset your password. Click the link below to reset it:

${resetLink}

If you did not request this, please ignore this email.

Cheers,
Perfin System`;

  const html = `<p>Hi ${recipient.name},</p>
<p>We received a request to reset your password. Click the link below to reset it:</p>
<p><a href="${resetLink}">Reset Password</a></p>
<p>If you did not request this, please ignore this email.</p>
<p>Cheers,<br>Perfin System</p>`;

  return sendEmail(ctx, recipient, addTextAndHtml(msg, text, html));
}

export function sendPasswordChangedEmail(ctx: Context, recipient: Recipient) {
  const msg = createBaseMessage(ctx, recipient, 'Your Password Was Changed');

  const text = `Hi ${recipient.name},

Your password (or passkey) has been successfully changed.

If you did not perform this action, please secure your account immediately.

Cheers,
Perfin System`;

  const html = `<p>Hi ${recipient.name},</p>
<p>Your password (or passkey) has been successfully changed.</p>
<p>If you did not perform this action, please secure your account immediately.</p>
<p>Cheers,<br>Perfin System</p>`;

  return sendEmail(ctx, recipient, addTextAndHtml(msg, text, html));
}

export function sendAccountLockedEmail(ctx: Context, recipient: Recipient, untilWhen: string) {
  const msg = createBaseMessage(ctx, recipient, 'Account Temporarily Locked');

  const text = `Hi ${recipient.name},

We detected multiple unsuccessful login attempts. Your account has been temporarily locked until ${untilWhen} to prevent unauthorized access.

Please reset your password if you suspect any suspicious activity.

Cheers,
Perfin System`;

  const html = `<p>Hi ${recipient.name},</p>
<p>We detected multiple unsuccessful login attempts. Your account has been temporarily locked until ${untilWhen} to prevent unauthorized access.</p>
<p>Please reset your password if you suspect any suspicious activity.</p>
<p>Cheers,<br>Perfin System</p>`;

  return sendEmail(ctx, recipient, addTextAndHtml(msg, text, html));
}

type EmailCodeRequestType = 'signup';

type CreateEmailCodeOption = {
  /**
   * in seconds
   * @default 300 (5mins)
   */
  expiresIn?: number;
};

export async function createEmailCode(
  ctx: Context,
  requestType: EmailCodeRequestType,
  email: string,
  options?: CreateEmailCodeOption,
) {
  const { db, url } = ctx;
  const { expiresIn = 300 } = options ?? {};

  const code = nanoid(16);
  await db.insert(emailCodesTable).values({
    email,
    emailCode: code,
    requestType,
    validUntil: addSeconds(new Date(), expiresIn),
  });

  const verificationUrl = new URL(`/verify/${code}`, url.origin);

  return {
    code,
    verificationUrl,
  };
}

export async function verifyEmailCode(ctx: Context, code: string) {
  const { db } = ctx;
  const emailCode = await db.query.emailCodesTable.findFirst({
    where: and(eq(emailCodesTable.emailCode, code), gt(emailCodesTable.validUntil, new Date())),
  });

  if (emailCode) {
    await db.update(emailCodesTable).set({ validUntil: new Date() }).where(eq(emailCodesTable.emailCode, code));
    return {
      isValid: true,
      requestType: emailCode.requestType as EmailCodeRequestType,
      email: emailCode.email,
    };
  } else {
    return {
      isValid: false,
    };
  }
}

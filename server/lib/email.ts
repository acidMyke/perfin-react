// import { createMimeMessage, MIMEMessage, type MailboxAddrObject } from 'mimetext';
import type { Context } from '../trpc';
// import { EmailMessage } from 'cloudflare:email';
import { nanoid } from 'nanoid';
import { emailCodesTable } from '../../db/schema';
import { addSeconds } from 'date-fns';
import { and, eq, gt, SQL } from 'drizzle-orm';

export interface MailjetAddrObject {
  Email: string;
  Name?: string;
}

export interface MailjetAttachment {
  ContentType: string;
  Filename: string;
  Base64Content: string;
}

export interface SendEmailOptions {
  to: MailjetAddrObject[];
  subject: string;
  html: string;
  text?: string;
  attachments?: MailjetAttachment[];
  replyTo?: MailjetAddrObject;
}

export class MailjetMessage {
  private to: MailjetAddrObject[] = [];
  private subject?: string;
  private textPart?: string;
  private htmlPart?: string;
  private attachments?: MailjetAttachment[];

  constructor() {}

  /** Gets the subject line */
  getSubject() {
    return this.subject;
  }

  /** Sets the subject line */
  setSubject(subject: string): this {
    this.subject = subject;
    return this;
  }

  /** Gets the plain text content */
  getText() {
    return this.textPart;
  }

  /** Sets the plain text content */
  setText(text: string): this {
    this.textPart = text;
    return this;
  }

  /** Gets the HTML content */
  getHtml() {
    return this.htmlPart;
  }

  /** Sets the HTML content */
  setHtml(html: string): this {
    this.htmlPart = html;
    return this;
  }

  /** Adds a recipient (can be called multiple times) */
  addRecipient(email: string, name?: string): this {
    this.to.push({ Email: email, Name: name });
    return this;
  }

  /** Adds an attachment (Base64 encoded) */
  addAttachment(attachment: MailjetAttachment): this {
    if (!this.attachments) this.attachments = [];
    this.attachments.push(attachment);
    return this;
  }

  /** Validates the email before sending */
  private validate(): void {
    if (this.to.length === 0) throw new Error('No recipients specified.');
    if (!this.subject) throw new Error('Subject is required.');
    if (!this.htmlPart && !this.textPart) throw new Error('Either HTML or text content is required.');
  }

  /** Sends the email through Mailjet */
  async send(ctx: Context): Promise<Response> {
    this.validate();
    const { env } = ctx;
    const From = {
      Email: env.EMAIL_SENDER_ADDR,
      Name: env.EMAIL_SENDER_NAME,
    };
    const auth = btoa(`${env.MJ_APIKEY_PUBLIC}:${env.MJ_APIKEY_PRIVATE}`);

    const message = {
      From,
      To: this.to,
      Subject: this.subject,
      TextPart: this.textPart,
      HTMLPart: this.htmlPart,
      Attachments: this.attachments,
    };

    const body = { Messages: [message] };

    const res = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Mailjet API error (${res.status}): ${errText}`);
    }

    return res;
  }
}

export function signUpVerificationEmail(username: string, verificationLink: string) {
  const text = `Hi ${username},

Thank you for signing up! Please verify your email address by clicking the link below:

${verificationLink}

If you did not sign up, please ignore this email.

Cheers,
The Team`;

  const html = `<p>Hi ${username},</p>
<p>Thank you for signing up! Please verify your email address by clicking the link below:</p>
<p><a href="${verificationLink}">Verify Email</a></p>
<p>If you did not sign up, please ignore this email.</p>
<p>Cheers,<br>The Team</p>`;

  return new MailjetMessage().setSubject('Verify Your Email Address').setText(text).setHtml(html);
}

export function signInAlertEmail(username: string, ipAddress: string, location: string, dateTime: string) {
  const text = `Hi ${username},

We noticed a sign-in to your account from a new location:

IP Address: ${ipAddress}
Location: ${location}
Time: ${dateTime}

If this was you, no action is needed. If not, please secure your account immediately.

Cheers,
The Team`;

  const html = `<p>Hi ${username},</p>
<p>We noticed a sign-in to your account from a new location:</p>
<ul>
<li><strong>IP Address:</strong> ${ipAddress}</li>
<li><strong>Location:</strong> ${location}</li>
<li><strong>Time:</strong> ${dateTime}</li>
</ul>
<p>If this was you, no action is needed. If not, please secure your account immediately.</p>
<p>Cheers,<br>The Team</p>`;

  return new MailjetMessage().setSubject('New Sign-in Detected').setText(text).setHtml(html);
}

export function forgotPasswordEmail(username: string, resetLink: string) {
  const text = `Hi ${username},

We received a request to reset your password. Click the link below to reset it:

${resetLink}

If you did not request this, please ignore this email.

Cheers,
The Team`;

  const html = `<p>Hi ${username},</p>
<p>We received a request to reset your password. Click the link below to reset it:</p>
<p><a href="${resetLink}">Reset Password</a></p>
<p>If you did not request this, please ignore this email.</p>
<p>Cheers,<br>The Team</p>`;

  return new MailjetMessage().setSubject('Password Reset Request').setText(text).setHtml(html);
}

export function passwordChangedEmail(username: string) {
  const text = `Hi ${username},

Your password (or passkey) has been successfully changed.

If you did not perform this action, please secure your account immediately.

Cheers,
The Team`;

  const html = `<p>Hi ${username},</p>
<p>Your password (or passkey) has been successfully changed.</p>
<p>If you did not perform this action, please secure your account immediately.</p>
<p>Cheers,<br>The Team</p>`;

  return new MailjetMessage().setSubject('Your Passkey/Password Was Changed').setText(text).setHtml(html);
}

export function accountLockedEmail(username: string) {
  const text = `Hi ${username},

We detected multiple unsuccessful login attempts. Your account has been temporarily locked to prevent unauthorized access.

Please reset your password if you suspect any suspicious activity.

Cheers,
The Team`;

  const html = `<p>Hi ${username},</p>
<p>We detected multiple unsuccessful login attempts. Your account has been temporarily locked to prevent unauthorized access.</p>
<p>Please reset your password if you suspect any suspicious activity.</p>
<p>Cheers,<br>The Team</p>`;

  return new MailjetMessage().setSubject('Account Temporarily Locked').setText(text).setHtml(html);
}

type EmailCodePurpose = 'signup/verify' | 'signup/finalize';

type CreateEmailCodeOption = {
  /**
   * in seconds
   * @default 300 (5mins)
   */
  expiresIn?: number;
};

export async function createEmailCode(
  ctx: Context,
  purpose: EmailCodePurpose,
  email: string,
  options?: CreateEmailCodeOption,
) {
  const { db, url } = ctx;
  const { expiresIn = 300 } = options ?? {};

  const code = nanoid(16);
  await db.insert(emailCodesTable).values({
    email,
    code,
    purpose,
    validUntil: addSeconds(new Date(), expiresIn),
  });

  const verificationUrl = new URL('/' + purpose, url.origin);
  verificationUrl.searchParams.set('code', code);
  return { code, verificationUrl };
}

export async function verifyEmailCode(ctx: Context, code: string) {
  const { db } = ctx;
  const emailCode = await db.query.emailCodesTable.findFirst({
    where: and(eq(emailCodesTable.code, code), gt(emailCodesTable.validUntil, new Date())),
  });

  if (emailCode) {
    return {
      isValid: true,
      purpose: emailCode.purpose as EmailCodePurpose,
      email: emailCode.email,
    } as const;
  } else {
    return {
      isValid: false,
    } as const;
  }
}

type EmailInvalidationOption = {
  email?: string;
  purpose?: string;
  code?: string;
};

export async function invalidateEmailCode(ctx: Context, option: EmailInvalidationOption) {
  const { db } = ctx;
  const conditions: SQL[] = [gt(emailCodesTable.validUntil, new Date())];
  if (option.email) conditions.push(eq(emailCodesTable.email, option.email));
  if (option.purpose) conditions.push(eq(emailCodesTable.purpose, option.purpose));
  if (option.code) conditions.push(eq(emailCodesTable.code, option.code));

  await db
    .update(emailCodesTable)
    .set({ validUntil: addSeconds(new Date(), 5) })
    .where(and(...conditions));
}

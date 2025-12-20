import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { FormInputError, protectedProcedure, publicProcedure } from '../trpc';
import { eq, or } from 'drizzle-orm';
import { usersTable } from '../../db/schema';
import { TRPCError } from '@trpc/server';
import { sleep } from '../lib/utils';
import sessions from '../lib/sessions';
import { signInValidator, signUpValidator } from '../validators';
import { addSeconds, isBefore } from 'date-fns';
import z from 'zod';
import { createEmailCode, invalidateEmailCode, signUpVerificationEmail, verifyEmailCode } from '../lib/email';

function generateSalt(length = 16) {
  return randomBytes(length);
}

const scriptKeylen = 32;
const scryptOptions: ScryptOptions = {
  N: 2 ** 13,
  r: 16,
  p: 1,
} as const;

function stringToBuffer(str: string): Buffer {
  return Buffer.from(str, 'utf-8');
}

/**
 * Hash a password using scrypt.
 */
function hashPassword(password: string | Buffer, salt: Buffer): Promise<Buffer> {
  const passBuffer = typeof password === 'string' ? stringToBuffer(password) : password;
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(passBuffer, salt, scriptKeylen, scryptOptions, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

/**
 * Verify password by comparing derived key to stored hash.
 */
function verifyPassword(input: string | Buffer, storedHash: Buffer, salt: Buffer): Promise<boolean> {
  const inputBuffer = typeof input === 'string' ? stringToBuffer(input) : input;
  return new Promise<boolean>((resolve, reject) => {
    scrypt(inputBuffer, salt, scriptKeylen, scryptOptions, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(timingSafeEqual(storedHash, derivedKey));
    });
  });
}

const signInProcedure = publicProcedure
  .input(signInValidator)
  .mutation(async ({ input: { username, password }, ctx }) => {
    const timeStart = Date.now();
    const user = await ctx.db.query.usersTable.findFirst({
      where: eq(usersTable.name, username),
      columns: {
        id: true,
        name: true,
        passSalt: true,
        passDigest: true,
        failedAttempts: true,
        releasedAfter: true,
      },
    });

    try {
      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          cause: new FormInputError({
            fieldErrors: {
              username: ['Unable to find username'],
            },
          }),
        });
      }

      if (user.releasedAfter && isBefore(user.releasedAfter, new Date())) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          cause: new FormInputError({
            fieldErrors: {
              username: ['Account is locked'],
            },
          }),
        });
      }

      if (!user.passDigest || !user.passSalt || !(await verifyPassword(password, user.passDigest, user.passSalt))) {
        const failedAttempts = user.failedAttempts;
        let releasedAfter: Date | null = null;
        if (failedAttempts >= 3) {
          const duration = Math.pow(1.8, failedAttempts - 2) * 30;
          releasedAfter = addSeconds(new Date(), duration);
        }

        await ctx.db.update(usersTable).set({ releasedAfter, failedAttempts }).where(eq(usersTable.id, user.id));

        throw new TRPCError({
          code: 'UNAUTHORIZED',
          cause: new FormInputError({
            fieldErrors: {
              password: ['Password mismatch'],
            },
          }),
        });
      }

      ctx.wctx.waitUntil(
        ctx.db.update(usersTable).set({ failedAttempts: 0, releasedAfter: null }).where(eq(usersTable.id, user.id)),
      );

      // Create session
      await sessions.create(ctx, user.id);

      return {
        userName: user?.name,
        userId: user?.id,
      };
    } catch (error: unknown) {
      await Promise.all([
        // if error, execution must be at least 2 seconds
        sleep(2000 - (Date.now() - timeStart)),
        sessions.saveLoginAttempt(ctx, false, user?.id ?? null),
      ]);
      throw error;
    }
  });

const signUpEmailProcedure = publicProcedure
  .input(
    z.object({
      name: z.string().min(5),
      email: z.email(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const { db } = ctx;
    const existingUser = await db.query.usersTable.findFirst({
      where: or(eq(usersTable.email, input.email), eq(usersTable.name, input.name)),
    });

    if (existingUser) {
      if (existingUser.email === input.email) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          cause: new FormInputError({ fieldErrors: { email: ['Email used'] } }),
        });
      } else {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          cause: new FormInputError({ fieldErrors: { name: ['Name used'] } }),
        });
      }
    }

    const { verificationUrl } = await createEmailCode(ctx, 'signup/verify', input.email);
    verificationUrl!.searchParams.set('username', input.name);
    await signUpVerificationEmail(input.name, verificationUrl!.toString())
      .addRecipient(input.email, input.name)
      .send(ctx);
    return { success: true };
  });

const signUpVerifyProcedure = publicProcedure.input(z.object({ code: z.string() })).mutation(async ({ ctx, input }) => {
  const { isValid, purpose, email } = await verifyEmailCode(ctx, input.code);
  if (!isValid || purpose != 'signup/verify') {
    throw new TRPCError({
      code: 'UNPROCESSABLE_CONTENT',
      message: 'Invalid Code',
    });
  }

  // Issue another code for the validated email with longer duration, this code is not sent in email
  const { code } = await createEmailCode(ctx, 'signup/finalize', email, { expiresIn: 600 }); // 10 minutes
  return { code, email };
});

const signUpFinalizeProcedure = publicProcedure
  .input(signUpValidator.extend({ code: z.string() }))
  .mutation(async ({ input: { username, password, code }, ctx }) => {
    const [{ isValid, purpose, email }, inUsedUsername] = await Promise.all([
      verifyEmailCode(ctx, code),
      ctx.db.$count(usersTable, eq(usersTable.name, username)).then(count => count > 0),
    ]);

    if (!isValid || purpose != 'signup/finalize') {
      throw new TRPCError({
        code: 'UNPROCESSABLE_CONTENT',
        message: 'Code expired, please retry',
      });
    }

    if (inUsedUsername) {
      throw new TRPCError({
        code: 'UNPROCESSABLE_CONTENT',
        cause: new FormInputError({ fieldErrors: { name: ['Name used'] } }),
      });
    }

    const passSalt = generateSalt();
    const passDigest = await hashPassword(password, passSalt);
    const [user] = await ctx.db
      .insert(usersTable)
      .values({
        name: username,
        email,
        passDigest,
        passSalt,
      })
      .returning({
        id: usersTable.id,
        name: usersTable.name,
      });

    await invalidateEmailCode(ctx, { email });

    if (!user) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Sign up successful but unable to sign in. Please try again later',
      });
    }

    // Create session
    await sessions.create(ctx, user.id);

    return {
      userName: user.name,
      userId: user.id,
    };
  });

const signOutProcedure = protectedProcedure.mutation(async ({ ctx }) => {
  sessions.revoke(ctx);
});

const whoamiProcedure = publicProcedure.query(async ({ ctx }) => {
  const { isAuthenticated, user, session } = ctx;

  return {
    isAuthenticated,
    userName: user?.name,
    userId: user?.id,
    sessionExpiresAt: session?.expiresAt,
    sessionCreatedAt: session?.createdAt,
  };
});

export const usersProcedures = {
  whoami: whoamiProcedure,
  session: {
    signIn: signInProcedure,
    signOut: signOutProcedure,
    signUpEmail: signUpEmailProcedure,
    signUpVerify: signUpVerifyProcedure,
    signUpFinalize: signUpFinalizeProcedure,
  },
} as const;

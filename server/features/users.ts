import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { FormInputError, publicProcedure } from '../trpc';
import { eq } from 'drizzle-orm';
import { usersTable } from '../../db/schema';
import { TRPCError } from '@trpc/server';
import { sleep } from '../lib';
import sessions from '../sessions';
import { signInValidator, signUpValidator } from '../validators';
import { addSeconds, isBefore } from 'date-fns';

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
        passKey: true,
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

      if (!user.passKey || !user.passSalt || !(await verifyPassword(password, user.passKey, user.passSalt))) {
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
      // if error, execution must be at least 2 seconds
      await sleep(2000 - (Date.now() - timeStart));
      throw error;
    }
  });

const signUpProcedure = publicProcedure
  .input(signUpValidator)
  .mutation(async ({ input: { username, password }, ctx }) => {
    const timeStart = Date.now();
    const user = await ctx.db.query.usersTable.findFirst({
      where: eq(usersTable.name, username),
      columns: {
        id: true,
        name: true,
        passSalt: true,
        passKey: true,
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

      if (user.passKey || user.passSalt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          cause: new FormInputError({
            fieldErrors: {
              username: ['Username in-used'],
            },
          }),
        });
      }

      const salt = generateSalt();
      const hash = await hashPassword(password, salt);

      await ctx.db.update(usersTable).set({ passSalt: salt, passKey: hash }).where(eq(usersTable.id, user.id));

      // Create session
      await sessions.create(ctx, user.id);

      return {
        userName: user?.name,
        userId: user?.id,
      };
    } catch (error: unknown) {
      // if error, execution must be at least 2 seconds
      await sleep(2000 - (Date.now() - timeStart));
      throw error;
    }
  });

const whoamiProcedure = publicProcedure.query(async ({ ctx }) => {
  const { isAuthenticated, user, session, promises } = await sessions.resolve(ctx, /*allowUnauthicated:*/ true);
  if (promises) {
    await Promise.allSettled(promises);
  }

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
    signUp: signUpProcedure,
  },
} as const;

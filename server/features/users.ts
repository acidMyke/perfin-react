import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { z } from 'zod';
import { publicProcedure } from '../trpc';
import { eq } from 'drizzle-orm';
import { sessionsTable, usersTable } from '../../db/schema';
import { TRPCError } from '@trpc/server';
import { generateTokenParam, sleep } from '../lib';

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
  .input(
    z.object({
      username: z.string(),
      password: z.string(),
    }),
  )
  .mutation(async ({ input: { username, password }, ctx: { db, resHeaders, env } }) => {
    const timeStart = Date.now();
    const user = await db.query.usersTable.findFirst({
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
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Unable to find username' });
      }

      if (!user.passKey || !user.passSalt || !(await verifyPassword(password, user.passKey, user.passSalt))) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Password mismatch' });
      }

      // Create session
      const { token, expiresAt, maxAge } = generateTokenParam();
      await db.insert(sessionsTable).values({
        token,
        expiresAt,
        userId: user.id,
        lastUsedAt: new Date(),
      });

      resHeaders.setCookie(env.TOKEN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: !import.meta.env.DEV,
        path: '/',
        expires: expiresAt,
        maxAge,
      });
    } catch (error: unknown) {
      // if error, execution must be at least 5 seconds
      await sleep(5000 - (Date.now() - timeStart));
      throw error;
    }
  });

const signUpProcedure = publicProcedure
  .input(
    z.object({
      username: z.string().min(4),
      password: z
        .string()
        .min(12)
        .regex(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/, 'Password too week'),
    }),
  )
  .mutation(async ({ input: { username, password }, ctx: { db, resHeaders, env } }) => {
    const timeStart = Date.now();
    const user = await db.query.usersTable.findFirst({
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
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Unable to find username' });
      }

      if (user.passKey || user.passSalt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Username in-used' });
      }

      const salt = generateSalt();
      const hash = await hashPassword(password, salt);

      await db.update(usersTable).set({ passSalt: salt, passKey: hash }).where(eq(usersTable.id, user.id));

      // Create session
      const { token, expiresAt, maxAge } = generateTokenParam();
      await db.insert(sessionsTable).values({
        token,
        expiresAt,
        userId: user.id,
        lastUsedAt: new Date(),
      });

      resHeaders.setCookie(env.TOKEN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: !import.meta.env.DEV,
        path: '/',
        maxAge,
      });
    } catch (error: unknown) {
      // if error, execution must be at least 5 seconds
      await sleep(5000 - (Date.now() - timeStart));
      throw error;
    }
  });

export const usersProcedures = {
  session: {
    signIn: signInProcedure,
    signUp: signUpProcedure,
  },
} as const;

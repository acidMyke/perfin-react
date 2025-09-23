import type { Context, ProtectedContext } from '../trpc';
import { addDays } from 'date-fns/addDays';
import { randomBytes } from 'node:crypto';
import * as schema from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import { differenceInDays } from 'date-fns/differenceInDays';
import { addMinutes } from 'date-fns/addMinutes';
import { TRPCError } from '@trpc/server';
import { UAParser } from 'ua-parser-js';

export function generateTokenParam() {
  return {
    maxAge: 7 * 24 * 60 * 60,
    expiresAt: addDays(new Date(), 7),
    token: randomBytes(12).toString('hex').substring(0, 16),
  };
}

async function create(ctx: Context, userId: string) {
  const { db, env, resHeaders } = ctx;
  const { token, expiresAt, maxAge } = generateTokenParam();
  await db.insert(schema.sessionsTable).values({
    token,
    expiresAt,
    userId,
    lastUsedAt: new Date(),
  });

  resHeaders.setCookie(env.TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: !import.meta.env.DEV,
    path: '/',
    expires: expiresAt,
    maxAge,
  });
}

function unsetCookie(ctx: Pick<Context, 'resHeaders' | 'env'>) {
  const { resHeaders, env } = ctx;
  resHeaders.deleteCookie(env.TOKEN_COOKIE_NAME);
}

async function revoke(ctx: ProtectedContext, otherSessionId?: string) {
  const { session, user, db } = ctx;
  if (!otherSessionId) {
    unsetCookie(ctx);
  }
  await db
    .update(schema.sessionsTable)
    .set({ expiresAt: new Date() })
    .where(and(eq(schema.sessionsTable.id, otherSessionId ?? session.id), eq(schema.sessionsTable.userId, user.id)));
}

function getTokenFromHeader(ctx: Context) {
  const { req, env } = ctx;

  const cookieHeader = req.headers.get('Cookie');
  if (!cookieHeader) {
    return { token: undefined, failureReason: 'Missing cookie header' };
  }

  const cookies = cookieHeader.split(';').map(cookie => cookie.trim());

  if (cookies.length === 0) {
    return { token: undefined, failureReason: 'Empty cookie header' };
  }

  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split('=');
    if (name === env.TOKEN_COOKIE_NAME) {
      return {
        token: decodeURIComponent(rest.join('=')),
        failureReason: undefined,
      };
    }
  }

  return { token: undefined, failureReason: 'Missing token' };
}

async function refreshToken(ctx: Context, existingToken: string, userId: string) {
  const { db, env, resHeaders, wctx } = ctx;
  const { token, expiresAt, maxAge } = generateTokenParam();
  await db.insert(schema.sessionsTable).values({
    token,
    expiresAt,
    userId,
    lastUsedAt: new Date(),
  });
  resHeaders.setCookie(env.TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: !import.meta.env.DEV,
    path: '/',
    expires: expiresAt,
    maxAge,
  });
  wctx.waitUntil(
    db
      .update(schema.sessionsTable)
      .set({ expiresAt: addMinutes(new Date(), 2) })
      .where(eq(schema.sessionsTable.token, existingToken)),
  );
}

async function resolve(ctx: Context, allowUnauthicated = false) {
  const { db } = ctx;
  let { token, failureReason } = getTokenFromHeader(ctx);

  if (token) {
    const session = await db.query.sessionsTable.findFirst({
      where: (session, { eq, gt, and }) => and(eq(session.token, token), gt(session.expiresAt, new Date())),
      columns: { id: true, createdAt: true, expiresAt: true, lastUsedAt: true },
      with: { user: { columns: { id: true, name: true } } },
    });

    if (session) {
      let promises: Promise<any>[] = [];
      const sessionUpdatePr = db
        .update(schema.sessionsTable)
        .set({ lastUsedAt: new Date() })
        .where(eq(schema.sessionsTable.id, session.id));
      promises.push(sessionUpdatePr);

      // Refresh token if its created more than 2 days ago.
      if (differenceInDays(new Date(), session.createdAt) > 2) {
        const refreshTokenPr = refreshToken(ctx, token, session.user.id);
        promises.push(refreshTokenPr);
      }

      return {
        isAuthenticated: true,
        user: session.user,
        session,
        promises,
      };
    }
    failureReason = 'Unable to find token';
    unsetCookie(ctx);
  }

  if (allowUnauthicated) {
    return {
      isAuthenticated: false,
      failureReason: import.meta.env.DEV ? failureReason : undefined,
    };
  }

  if (import.meta.env.DEV) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: failureReason });
  }
  throw new TRPCError({ code: 'UNAUTHORIZED' });
}

async function getTelemetry(ctx: Context) {
  const { db, req } = ctx;
  const cf = req.cf;
  const headers = req.headers;
  const ua = headers.get('user-agent') ?? '';
  const parsedUa = new UAParser(ua).getResult();
  const userAgent = `${parsedUa.browser.name} ${parsedUa.browser.version} / ${parsedUa.os.name} ${parsedUa.os.version}`;

  const telemetry: Omit<typeof schema.loginAttemptsTable.$inferInsert, 'isSuccess' | 'attemptedForId'> = {
    ip: headers.get('cf-connecting-ip') ?? '',
    userAgent,
  };

  const cfKeys = ['asn', 'city', 'region', 'country', 'colo'];
  for (const key of cfKeys) {
    if (cf?.[key]) {
      // @ts-expect-error
      telemetry[key] = cf?.[key];
    }
  }
}

export const sessions = {
  create,
  resolve,
  revoke,
};

export default sessions;

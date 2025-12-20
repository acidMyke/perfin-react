import type { Context, ProtectedContext } from '../trpc';
import { addDays } from 'date-fns/addDays';
import { randomBytes } from 'node:crypto';
import * as schema from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import { differenceInDays } from 'date-fns/differenceInDays';
import { addMinutes } from 'date-fns/addMinutes';
import { UAParser } from 'ua-parser-js';
import type { AppDatabase } from './db';
import type { CookieHeaders } from './CookieHeaders';

export function generateTokenParam() {
  return {
    maxAge: 7 * 24 * 60 * 60,
    expiresAt: addDays(new Date(), 7),
    token: randomBytes(12).toString('hex').substring(0, 16),
  };
}

function setTokenCookie(env: Env, resHeaders: CookieHeaders, param: ReturnType<typeof generateTokenParam>) {
  const { token, expiresAt, maxAge } = param;
  resHeaders.setCookie(env.TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: !import.meta.env.DEV,
    path: '/',
    expires: expiresAt,
    maxAge,
  });
}

function unsetTokenCookie(env: Env, resHeaders: CookieHeaders) {
  resHeaders.deleteCookie(env.TOKEN_COOKIE_NAME, {
    path: '/',
  });
}

async function createAndSaveToken(
  db: AppDatabase,
  env: Env,
  resHeaders: CookieHeaders,
  userId: string,
  loginAttemptId: string,
) {
  const tokenParam = generateTokenParam();
  const { token, expiresAt } = tokenParam;

  await db.insert(schema.sessionsTable).values({
    token,
    expiresAt,
    userId,
    lastUsedAt: new Date(),
    loginAttemptId,
  });
  setTokenCookie(env, resHeaders, tokenParam);
}

async function revokeToken(db: AppDatabase, userId: string, sessionId: string, revokeLater = false) {
  let expiresAt = new Date();
  if (revokeLater) {
    expiresAt = addMinutes(expiresAt, 2);
  }
  const result = await db
    .update(schema.sessionsTable)
    .set({ expiresAt })
    .where(and(eq(schema.sessionsTable.id, sessionId), eq(schema.sessionsTable.userId, userId)));

  console.log('revoke_token', { result: result.meta });
}

async function saveLoginAttempt(ctx: Context, isSuccess: boolean, attemptedForId: string | null = null) {
  const { db, req } = ctx;
  const cf = req.cf;
  const headers = req.headers;
  const ua = headers.get('user-agent') ?? '';
  const parsedUa = new UAParser(ua).getResult();
  const userAgent = `${parsedUa.browser.name} ${parsedUa.browser.version} / ${parsedUa.os.name} ${parsedUa.os.version}`;

  const attempt: typeof schema.loginAttemptsTable.$inferInsert = {
    ip: headers.get('cf-connecting-ip') ?? '',
    userAgent,
    isSuccess,
    attemptedForId,
  };

  const cfKeys = ['asn', 'city', 'region', 'country', 'colo'];
  for (const key of cfKeys) {
    if (cf?.[key]) {
      // @ts-expect-error
      attempt[key] = cf?.[key];
    }
  }

  const [{ id: loginAttemptId }] = await db
    .insert(schema.loginAttemptsTable)
    .values(attempt)
    .returning({ id: schema.loginAttemptsTable.id });

  return loginAttemptId;
}

async function create(ctx: Context, userId: string) {
  const { db, env, resHeaders } = ctx;
  const loginAttemptId = await saveLoginAttempt(ctx, true, userId);
  await createAndSaveToken(db, env, resHeaders, userId, loginAttemptId);
}

async function revoke(ctx: ProtectedContext, otherSessionId?: string) {
  const { session, userId, db } = ctx;
  if (!otherSessionId) {
    unsetTokenCookie(ctx.env, ctx.resHeaders);
  }
  await revokeToken(db, userId, otherSessionId ?? session.id);
}

function getTokensFromCookies(req: Request, env: Env) {
  const parsedCookies = {
    authToken: undefined as string | undefined,
    csrfToken: undefined as string | undefined,
  };
  const cookieHeader = req.headers.get('Cookie');
  const cookies = cookieHeader?.split(';')?.map(cookie => cookie.trim());

  if (!cookies || cookies.length === 0) {
    return parsedCookies;
  }

  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split('=');
    const decoded = decodeURIComponent(rest.join('='));
    if (name === env.TOKEN_COOKIE_NAME) {
      parsedCookies.authToken = decoded;
    } else if (name === 'csrf') {
      parsedCookies.csrfToken = decoded;
    }
  }

  return parsedCookies;
}

async function check(db: AppDatabase, req: Request, env: Env, resHeaders: CookieHeaders) {
  const { authToken, csrfToken } = getTokensFromCookies(req, env);

  if (!csrfToken) {
    const { expiresAt, maxAge, token } = generateTokenParam();
    resHeaders.setCookie('csrf', token, {
      secure: !import.meta.env.DEV,
      path: '/',
      expires: expiresAt,
      maxAge,
      sameSite: 'Lax',
    });
  }

  if (!authToken) {
    return {
      isAuthenticated: false as const,
      authFailureReason: 'Missing token',
    };
  }

  const session = await db.query.sessionsTable.findFirst({
    where: (session, { eq, gt, and }) => and(eq(session.token, authToken), gt(session.expiresAt, new Date())),
    columns: { id: true, createdAt: true, expiresAt: true, loginAttemptId: true },
    with: { user: { columns: { id: true, name: true } } },
  });

  if (!session) {
    resHeaders.deleteCookie(env.TOKEN_COOKIE_NAME);
    return {
      isAuthenticated: false as const,
      authFailureReason: 'Unable to find token',
    };
  }

  const userId = session.user.id;

  // if the token is older then 2 days, refresh it
  if (differenceInDays(new Date(), session.createdAt) > 2) {
    await createAndSaveToken(db, env, resHeaders, userId, session.loginAttemptId);
    await revokeToken(db, userId, session.id, true);
  }

  let isCsrfValid = false;
  if (csrfToken) {
    isCsrfValid = req.headers.get('X-CSRF-Token') == csrfToken;
  }

  return {
    isCsrfValid,
    isAuthenticated: true as const,
    session,
    user: session.user,
    userId,
  };
}

export const sessions = {
  create,
  revoke,
  saveLoginAttempt,
  getTokenFromReq: getTokensFromCookies,
  check,
};

export default sessions;

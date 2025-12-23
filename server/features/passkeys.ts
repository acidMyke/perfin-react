import { protectedProcedure, publicProcedure } from '../lib/trpc';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import { passkeysTable, usersTable } from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { isoUint8Array } from '@simplewebauthn/server/helpers';
import z from 'zod';
import sessions from '../lib/sessions';

const REGISTRATION_CHALLENGE_COOKIE_NAME = 'passkey-challenge';
const jsonObjectPassthrough = <T>(input: unknown) => {
  if (input && typeof input === 'object') return input as T;
  throw new Error('Input is not a object');
};
const generatePasskeyRegistrationOptionsProcedure = protectedProcedure.mutation(async ({ ctx }) => {
  const { db, env, user, resHeaders } = ctx;

  const excludeCredentials = await db
    .select({
      id: passkeysTable.id,
      transports: passkeysTable.transports,
    })
    .from(passkeysTable)
    .where(eq(passkeysTable.userId, user.id));

  const options = await generateRegistrationOptions({
    rpID: env.PASSKEYS_RP_ID,
    rpName: env.PASSKEYS_RP_NAME,
    userName: user.name,
    userID: isoUint8Array.fromUTF8String(user.id),
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'preferred',
    },
  });

  resHeaders.setCookie(REGISTRATION_CHALLENGE_COOKIE_NAME, options.challenge, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 120,
    path: '/',
  });

  return options;
});

const verifyPasskeyRegistrationResponseProcedure = protectedProcedure
  .input(jsonObjectPassthrough<RegistrationResponseJSON>)
  .mutation(async ({ ctx, input }) => {
    const { db, env, userId, reqCookie } = ctx;
    const challenge = reqCookie[REGISTRATION_CHALLENGE_COOKIE_NAME];

    if (!challenge) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No challenge found' });
    }

    let verification: VerifiedRegistrationResponse | undefined;
    try {
      verification = await verifyRegistrationResponse({
        response: input,
        expectedChallenge: challenge,
        expectedOrigin: env.ORIGIN,
        expectedRPID: env.PASSKEYS_RP_ID,
      });
      if (!verification.verified) {
        throw new Error('verification.verified is false');
      }
    } catch (cause) {
      const message =
        cause && typeof cause === 'object' && 'message' in cause
          ? 'Verification failed: ' + cause.message
          : 'Verification failed';
      throw new TRPCError({ code: 'BAD_REQUEST', message, cause });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const { id, counter, publicKey, transports } = credential;

    await db.insert(passkeysTable).values({
      id,
      userId,
      counter,
      transports,
      publicKey: Buffer.from(publicKey),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    });

    return { success: true };
  });

const listRegisteredPasskey = protectedProcedure.query(async ({ ctx }) => {
  const { db, userId } = ctx;
  const passkeys = await db
    .select({
      id: passkeysTable.id,
      nickname: passkeysTable.nickname,
      createdAt: passkeysTable.createdAt,
    })
    .from(passkeysTable)
    .where(eq(passkeysTable.userId, userId));

  return { passkeys };
});

const updateRegisteredPasskey = protectedProcedure
  .input(z.object({ passkeyId: z.string(), nickname: z.string().nullable() }))
  .mutation(async ({ ctx, input }) => {
    const { passkeyId, nickname } = input;
    const { db, userId } = ctx;
    const result = await db
      .update(passkeysTable)
      .set({ nickname })
      .where(and(eq(passkeysTable.userId, userId), eq(passkeysTable.id, passkeyId)))
      .limit(1);

    if (result.meta.rows_written === 0) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    return { success: true };
  });

const deleteRegisteredPasskey = protectedProcedure
  .input(z.object({ passkeyId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const { passkeyId } = input;
    const { db, userId } = ctx;
    const result = await db
      .delete(passkeysTable)
      .where(and(eq(passkeysTable.userId, userId), eq(passkeysTable.id, passkeyId)))
      .limit(1)
      .returning({ nickname: passkeysTable.nickname, createdAt: passkeysTable.createdAt });

    if (result.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const [{ nickname, createdAt }] = result;

    return {
      nickname,
      createdAt,
    };
  });

const generatePasskeyAuthenticationOptionsProcedure = publicProcedure
  .input(z.object({ username: z.string() }).optional())
  .mutation(async ({ ctx, input }) => {
    const { db, env, resHeaders } = ctx;

    type TypeofGenerateAuthenticationOptions = typeof generateAuthenticationOptions;
    type AllowCredentials = Parameters<TypeofGenerateAuthenticationOptions>[0]['allowCredentials'];

    let allowCredentials: AllowCredentials;

    if (ctx.isAuthenticated) {
      allowCredentials = await db
        .select({
          id: passkeysTable.id,
          transports: passkeysTable.transports,
        })
        .from(passkeysTable)
        .where(eq(passkeysTable.userId, ctx.userId));
    } else if (input?.username?.trim()) {
      allowCredentials = await db
        .select({
          id: passkeysTable.id,
          transports: passkeysTable.transports,
        })
        .from(passkeysTable)
        .innerJoin(usersTable, eq(passkeysTable.userId, usersTable.id))
        .where(eq(usersTable.name, input.username.trim()));
    }

    if (allowCredentials && allowCredentials.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No passkeys found' });
    }

    const userVerification = allowCredentials ? undefined : 'preferred';
    const options = await generateAuthenticationOptions({
      rpID: env.PASSKEYS_RP_ID,
      allowCredentials,
      userVerification,
    });

    resHeaders.setCookie(REGISTRATION_CHALLENGE_COOKIE_NAME, options.challenge, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 120,
      path: '/',
    });

    return options;
  });

const verifyPasskeyAuthenticationResponseProcedure = publicProcedure
  .input(jsonObjectPassthrough<AuthenticationResponseJSON>)
  .mutation(async ({ ctx, input }) => {
    const { db, env, reqCookie } = ctx;
    const challenge = reqCookie[REGISTRATION_CHALLENGE_COOKIE_NAME];

    if (!challenge) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No challenge found' });
    }

    const [credential] = await db
      .select({
        id: passkeysTable.id,
        userId: passkeysTable.userId,
        publicKey: passkeysTable.publicKey,
        counter: passkeysTable.counter,
        transport: passkeysTable.transports,
      })
      .from(passkeysTable)
      .where(eq(passkeysTable.id, input.id));

    if (!credential) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    let verification: VerifiedAuthenticationResponse | undefined;
    try {
      verification = await verifyAuthenticationResponse({
        response: input,
        expectedChallenge: challenge,
        expectedOrigin: env.ORIGIN,
        expectedRPID: env.PASSKEYS_RP_ID,
        credential: { ...credential, publicKey: new Uint8Array(credential.publicKey) },
      });
      if (!verification.verified) {
        throw new Error('verification.verified is false');
      }
    } catch (cause) {
      const message =
        cause && typeof cause === 'object' && 'message' in cause
          ? 'Verification failed: ' + cause.message
          : 'Verification failed';
      throw new TRPCError({ code: 'BAD_REQUEST', message, cause });
    }

    const { newCounter } = verification.authenticationInfo;
    await db.update(passkeysTable).set({ counter: newCounter, lastUsedAt: new Date() });

    const [user] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, credential.userId));

    // Create session
    await sessions.create(ctx, credential.userId);

    return {
      userName: user?.name,
      userId: credential.userId,
    };
  });

export const passkeyProcedures = {
  list: listRegisteredPasskey,
  update: updateRegisteredPasskey,
  delete: deleteRegisteredPasskey,
  registration: {
    generateOptions: generatePasskeyRegistrationOptionsProcedure,
    verifyResponse: verifyPasskeyRegistrationResponseProcedure,
  },
  authentication: {
    generateOptions: generatePasskeyAuthenticationOptionsProcedure,
    verifyResponse: verifyPasskeyAuthenticationResponseProcedure,
  },
};

export default passkeyProcedures;

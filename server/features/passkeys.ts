import { protectedProcedure } from '../lib/trpc';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
  type VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import { passkeysTable } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { isoUint8Array } from '@simplewebauthn/server/helpers';

const REGISTRATION_CHALLENGE_COOKIE_NAME = 'pkreg-challenge';

const generatePasskeyRegistrationOptionsProcedure = protectedProcedure.query(async ({ ctx }) => {
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
  .input(input => {
    if (typeof input === 'object') {
      return input as RegistrationResponseJSON;
    }
    throw new Error('Input is not a object');
  })
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
        throw new Error();
      }
    } catch (error) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Verification failed' });
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

export const passkeyProcedures = {
  generateOptions: generatePasskeyRegistrationOptionsProcedure,
  verifyResponse: verifyPasskeyRegistrationResponseProcedure,
};

export default passkeyProcedures;

import { protectedProcedure } from '../lib/trpc';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { passkeysTable } from '../../db/schema';
import { eq } from 'drizzle-orm';

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
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'preferred',
    },
  });

  resHeaders.setCookie('reg-challenge', options.challenge, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 120,
    path: '/',
  });

  return options;
});

export const passkeyProcedures = {
  generateOptions: generatePasskeyRegistrationOptionsProcedure,
};

export default passkeyProcedures;

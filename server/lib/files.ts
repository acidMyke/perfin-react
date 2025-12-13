import { AwsV4Signer } from 'aws4fetch';
import type { ProtectedContext } from '../trpc';
import { fileRequestsTable } from '../../db/schema';

type CreateSignerCommonOptions = {
  filePath: string;
};

type CreateSignerOptionsForGet = CreateSignerCommonOptions & { method: 'GET' };
type CreateSignerOptionsForPut = CreateSignerCommonOptions & { method: 'PUT'; contentType: string };
type CreateSignerOptions = CreateSignerOptionsForGet | CreateSignerOptionsForPut;

export async function createSignedUrl(ctx: ProtectedContext, opts: CreateSignerOptions) {
  const { db, env, userId, session } = ctx;
  const { CF_ACCOUNT_ID, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME } = env;
  const { method, filePath } = opts;
  const expires = method === 'PUT' ? '300' : '600';
  const url = `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${S3_BUCKET_NAME}/${filePath}?X-Amz-Expires=${expires}`;
  const headers: Record<string, string> = {};
  if ('contentType' in opts) {
    headers['Content-Type'] = opts.contentType;
  }
  const signer = new AwsV4Signer({
    service: 's3',
    region: 'auto',
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    method,
    url,
    headers,
  });

  const [signed] = await Promise.all([
    signer.sign(),
    // Log a request whenver signed url is requested
    db.insert(fileRequestsTable).values({
      userId,
      sessionId: session.id,
      method,
      filePath,
      contentType: 'contentType' in opts ? opts.contentType : undefined,
    }),
  ]);

  return signed.url.toString();
}

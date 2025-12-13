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
  const isPut = method === 'PUT';
  const expires = isPut ? '300' : '600';
  const url = `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${S3_BUCKET_NAME}/${filePath}?X-Amz-Expires=${expires}`;
  const headers: Record<string, string> = {};
  if (isPut) headers['Content-Type'] = opts.contentType;

  const signer = new AwsV4Signer({
    service: 's3',
    region: 'auto',
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    method,
    url,
    headers,
    signQuery: true,
  });

  const [signed] = await Promise.all([
    signer.sign(),
    // Log a request whenver signed url is requested
    db.insert(fileRequestsTable).values({
      userId,
      sessionId: session.id,
      method,
      filePath,
      contentType: isPut ? opts.contentType : undefined,
      putState: isPut ? 'INITIAL' : undefined,
    }),
  ]);

  return signed.url.toString();
}

const mimeTypesByCategory = {
  audio: ['audio/aac', 'audio/midi', 'audio/x-midi', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'],
  video: [
    'video/x-msvideo',
    'video/mp4',
    'video/mpeg',
    'video/ogg',
    'video/mp2t',
    'video/webm',
    'video/3gpp',
    'audio/3gpp',
    'video/3gpp2',
    'audio/3gpp2',
  ],
  image: [
    'image/apng',
    'image/avif',
    'image/bmp',
    'image/gif',
    'image/vnd.microsoft.icon',
    'image/jpeg',
    'image/png',
    'image/svg+xml',
    'image/tiff',
    'image/webp',
  ],
  text: ['text/css', 'text/csv', 'text/html', 'text/javascript', 'text/markdown', 'text/plain', 'text/calendar'],
  pdf: ['application/pdf'],
};

export function isAllowedContentType(
  contentType: string,
  ...categories: (keyof typeof mimeTypesByCategory)[]
): boolean {
  // Check each category passed
  for (const category of categories) {
    if (mimeTypesByCategory[category].includes(contentType)) {
      return true;
    }
  }
  return false;
}

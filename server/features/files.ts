import { chainHandler, createIttyAppRouter, withAuth, withZod } from '#server/lib/itty';
import { z } from 'zod';
import { zfd } from 'zod-form-data';
import filetype from 'magic-bytes.js';
import { generateId, uploadedFilesTable } from '#schema';
import { eq } from 'drizzle-orm';

export const FILES_ROUTE_BASE = '/files';
export const filesRouter = createIttyAppRouter({ base: FILES_ROUTE_BASE });

const BINARY_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/x-icon',
  'application/pdf',
]);

const TEXT_MIME_TYPES = new Set(['text/plain', 'text/csv', 'text/markdown', 'application/json']);

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/x-icon': 'ico',

  'application/pdf': 'pdf',

  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'application/json': 'json',
};

filesRouter.post(
  '/upload',
  chainHandler(withAuth()).then(
    withZod({
      body: zfd.formData({
        uploadedFiles: zfd.repeatable(
          z
            .array(
              zfd.file().superRefine(async (file, ctx) => {
                if (!BINARY_MIME_TYPES.has(file.type) && !TEXT_MIME_TYPES.has(file.type)) {
                  ctx.addIssue({ code: 'custom', message: 'Unsupported file type.' });
                  return;
                }

                if (BINARY_MIME_TYPES.has(file.type)) {
                  const detected = filetype(await file.bytes());

                  if (!detected.some(({ mime }) => mime === file.type)) {
                    ctx.addIssue({ code: 'custom', message: 'The file contents do not match its MIME type.' });
                  }

                  return;
                }

                if (file.type === 'application/json') {
                  try {
                    JSON.parse(await file.text());
                  } catch {
                    ctx.addIssue({ code: 'custom', message: 'Invalid JSON file.' });
                  }
                }
              }),
            )
            .min(1),
        ),
      }),
    }),
  ),
  async request => {
    const uploadedFiles = request.validated.body.uploadedFiles;
    const { db, env, userId, wctx } = request.context;

    const r2UploadParams: { fileId: string; path: string; file: File; putOptions: R2PutOptions }[] = [];
    const uploadedFilesInserts: (typeof uploadedFilesTable.$inferInsert)[] = [];

    const requestId = generateId();
    for (const file of uploadedFiles) {
      const fileId = generateId();

      const ext = MIME_EXTENSIONS[file.type];
      const path = `user-files/${fileId}.${ext}`;
      const putOptions: R2PutOptions = {
        httpMetadata: { contentType: file.type, contentDisposition: `inline; filename="${file.name}"` },
        customMetadata: { userId, requestId, fileId },
      };
      r2UploadParams.push({ fileId, path, file, putOptions });
      uploadedFilesInserts.push({
        path,
        userId,
        requestId,
        id: fileId,
        size: file.size,
        mimeType: file.type,
        originalName: file.name,
      });
    }

    await db.insert(uploadedFilesTable).values(uploadedFilesInserts);
    wctx.waitUntil(
      Promise.all(
        r2UploadParams.map(async ({ fileId, path, file, putOptions }) => {
          try {
            const object = await env.bk.put(path, file, putOptions);
            if (!object) {
              return { fileId, failureReason: 'object_missing' };
            }
            if (!object.checksums.sha256) {
              return { fileId, failureReason: 'checksum_missing' };
            }
            return { fileId, checksum: Buffer.from(object.checksums.sha256) };
          } catch (err) {
            console.error('R2 upload failed', { fileId, err });
            return { fileId, failureReason: 'r2_put_failed' };
          }
        }),
      ).then(async props => {
        await db.batch(
          // @ts-expect-error Drizzle's batch() typing doesn't accept mapped query arrays.
          props.map(({ fileId, checksum, failureReason }) =>
            db
              .update(uploadedFilesTable)
              .set(failureReason ? { failedAt: new Date(), failureReason } : { uploadedAt: new Date(), checksum })
              .where(eq(uploadedFilesTable.id, fileId)),
          ),
        );
      }),
    );
    return { requestId };
  },
);

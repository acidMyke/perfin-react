import type { ProtectedContext } from './trpc';
import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { uploadedFilesTable } from '#schema';
import { caseWhen, sumAsNumber, type AppDatabase } from './db';

export async function getFilesCount(ctx: ProtectedContext, requestOrFileId: string) {
  const { db, userId } = ctx;
  const [{ successCount, failedCount, pendingCount }] = await db
    .select({
      successCount: sumAsNumber(caseWhen(isNotNull(uploadedFilesTable.uploadedAt), sql.raw('1')).else(sql.raw('0'))),
      failedCount: sumAsNumber(caseWhen(isNotNull(uploadedFilesTable.failedAt), sql.raw('1')).else(sql.raw('0'))),
      pendingCount: sumAsNumber(
        caseWhen(and(isNull(uploadedFilesTable.uploadedAt), isNull(uploadedFilesTable.failedAt))!, sql.raw('1')).else(
          sql.raw('0'),
        ),
      ),
    })
    .from(uploadedFilesTable)
    .where(
      and(
        eq(uploadedFilesTable.userId, userId),
        or(eq(uploadedFilesTable.requestId, requestOrFileId), eq(uploadedFilesTable.id, requestOrFileId)),
      ),
    );

  return { successCount, failedCount, pendingCount };
}

export async function getFileIdsByRequestId(db: AppDatabase, userId: string, requestId: string) {
  const fileIdObjs = await db
    .select({ fileId: uploadedFilesTable.id })
    .from(uploadedFilesTable)
    .where(and(eq(uploadedFilesTable.userId, userId), eq(uploadedFilesTable.requestId, requestId)));

  return fileIdObjs.map(({ fileId }) => fileId);
}

export function filesColumns() {
  return {
    fileId: uploadedFilesTable.id,
    name: uploadedFilesTable.originalName,
    size: uploadedFilesTable.size,
    mimeType: uploadedFilesTable.mimeType,
  };
}

import type { ProtectedContext } from './trpc';
import { BatchCollector, maybeBatch } from './BatchCollector';
import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { uploadedFilesTable } from '#schema';
import { caseWhen, sumAsNumber } from './db';

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

export async function attachFiles(ctx: ProtectedContext, requestOrFileId: string, collector?: BatchCollector) {
  const { db, userId } = ctx;

  await maybeBatch(
    collector,
    db
      .update(uploadedFilesTable)
      .set({ attachedAt: new Date() })
      .where(
        and(
          eq(uploadedFilesTable.userId, userId),
          or(eq(uploadedFilesTable.requestId, requestOrFileId), eq(uploadedFilesTable.id, requestOrFileId)),
        ),
      ),
  );
}

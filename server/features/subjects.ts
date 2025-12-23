import z from 'zod';
import { FormInputError, protectedProcedure } from '../lib/trpc';
import { accountsTable, categoriesTable } from '../../db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

const listSubjectsProcedure = protectedProcedure
  .input(z.object({ subjectType: z.enum(['account', 'category']) }))
  .query(async ({ ctx, input }) => {
    const { db, user } = ctx;
    const { subjectType } = input;
    const subjectsTable = {
      account: accountsTable,
      category: categoriesTable,
    }[subjectType];

    return await db
      .select({
        id: subjectsTable.id,
        name: subjectsTable.name,
        isDeleted: subjectsTable.isDeleted,
      })
      .from(subjectsTable)
      .where(and(eq(subjectsTable.userId, user.id)))
      .orderBy(asc(subjectsTable.sequence), asc(subjectsTable.createdAt));
  });

const saveSubjectListProcedure = protectedProcedure
  .input(
    z.object({
      subjectType: z.enum(['account', 'category']),
      subjects: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const { db, user } = ctx;
    const { subjectType, subjects } = input;
    const subjectsTable = {
      account: accountsTable,
      category: categoriesTable,
    }[subjectType];

    const existingSubjects = await db
      .select({
        id: subjectsTable.id,
        name: subjectsTable.name,
        description: subjectsTable.description,
      })
      .from(subjectsTable)
      .where(and(eq(subjectsTable.userId, user.id)))
      .orderBy(asc(subjectsTable.sequence), asc(subjectsTable.createdAt));

    if (existingSubjects.length != subjects.length) {
      throw new TRPCError({
        code: 'NOT_IMPLEMENTED',
        cause: new FormInputError({
          formErrors: ['Removal / Addition of subjects are not implemented'],
        }),
      });
    }

    const originalSubjectMap = new Map<string, (typeof existingSubjects)[number]>(existingSubjects.map(s => [s.id, s]));
    const updates: Pick<typeof subjectsTable.$inferSelect, 'id' | 'name' | 'sequence'>[] = [];
    const nameDict = new Map<string, number>();

    for (let i = 0; i < existingSubjects.length; i++) {
      const existing = existingSubjects[i];
      const current = subjects[i];

      if (nameDict.has(current.name)) {
        const otherIdx = nameDict.get(current.name)!;
        const currentOriginalName = originalSubjectMap.get(current.id)!.name;
        const fieldName = current.name === currentOriginalName ? `subjects[${otherIdx}].name` : `subjects[${i}].name`;

        throw new TRPCError({
          code: 'BAD_REQUEST',
          cause: new FormInputError({
            fieldErrors: {
              [fieldName]: ['Name must be unique'],
            },
          }),
        });
      }

      nameDict.set(current.name, i);

      if (existing.id !== current.id || existing.name !== current.name) {
        updates.push({ ...current, sequence: i });
      }
    }

    if (updates.length > 0) {
      await db.batch(
        // @ts-expect-error
        updates.map(({ id, ...setDate }) =>
          db
            .update(subjectsTable)
            .set(setDate)
            .where(and(eq(subjectsTable.id, id), eq(subjectsTable.userId, user.id))),
        ),
      );
    }
    return {
      message: `Updated ${updates.length} subjects`,
    };
  });

export const subjectProcedures = {
  list: listSubjectsProcedure,
  save: saveSubjectListProcedure,
};

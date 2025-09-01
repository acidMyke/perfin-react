import z from 'zod';
import { protectedProcedure } from '../trpc';
import { subjectsTable } from '../../db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { SUBJECT_TYPES_TUPLE } from '../../db/enum';

// let subjectPr =
//   typeof cursor !== 'undefined' && cursor !== null
//     ? undefined
//     : db
//         .select({
//           id: schema.subjectsTable.id,
//           type: schema.subjectsTable.type,
//           name: schema.subjectsTable.name,
//           sequence: schema.subjectsTable.sequence,
//           count: db.$count(
//             schema.expensesTable,
//             and(
//               eq(schema.expensesTable.belongsToId, userId),
//               or(
//                 eq(schema.expensesTable.accountId, schema.subjectsTable.id),
//                 eq(schema.expensesTable.categoryId, schema.subjectsTable.id),
//               ),
//             ),
//           ),
//         })
//         .from(schema.subjectsTable)
//         .where(eq(schema.subjectsTable.belongsToId, userId));

const listSubjectsProcedure = protectedProcedure
  .input(z.object({ subjectType: z.enum(SUBJECT_TYPES_TUPLE) }))
  .query(async ({ ctx, input }) => {
    const { db, user } = ctx;
    const { subjectType } = input;

    return await db
      .select({
        id: subjectsTable.id,
        name: subjectsTable.name,
        description: subjectsTable.description,
      })
      .from(subjectsTable)
      .where(and(eq(subjectsTable.type, subjectType), eq(subjectsTable.belongsToId, user.id)))
      .orderBy(asc(subjectsTable.sequence), asc(subjectsTable.createdAt));
  });

export const subjectProcedures = {
  list: listSubjectsProcedure,
};

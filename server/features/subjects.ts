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

export const subjectProcedures = {};

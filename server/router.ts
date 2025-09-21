import z from 'zod';
import { protectedProcedure, publicProcedure, router } from './trpc';
import { usersProcedures } from './features/users';
import { expenseProcedures } from './features/expenses';
import { subjectProcedures } from './features/subjects';
import { dashboardProcedure } from './features/dashboard';

export const appRouter = router({
  ...usersProcedures,
  dashboard: dashboardProcedure,
  expense: expenseProcedures,
  subject: subjectProcedures,
  testapi: publicProcedure
    .input(z.object({ name: z.string().optional() }).optional())
    .query(({ input }) => (input?.name ? `Hello, ${input.name}` : 'Hello world')),
  testauthapi: protectedProcedure.mutation(({ ctx: { user } }) => `Hello, ${user.name}`),
});

// For client to import just the types
export type AppRouter = typeof appRouter;

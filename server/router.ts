import z from 'zod';
import { protectedProcedure, publicProcedure, router } from './trpc';
import { usersProcedures } from './features/users';
import { expenseProcedures } from './features/expenses';
import { subjectProcedures } from './features/subjects';
import { dashboardProcedure } from './features/dashboard';
import { createSignedUrl } from './lib/files';

export const appRouter = router({
  ...usersProcedures,
  dashboard: dashboardProcedure,
  expense: expenseProcedures,
  subject: subjectProcedures,
  testapi: publicProcedure
    .input(z.object({ name: z.string().optional() }).optional())
    .query(({ input }) => (input?.name ? `Hello, ${input.name}` : 'Hello world')),
  testauthapi: protectedProcedure.mutation(({ ctx: { user } }) => `Hello, ${user.name}`),
  testPresignedUrl: protectedProcedure
    .input(z.object({ files: z.array(z.object({ contentType: z.string(), filePath: z.string() })) }))
    .mutation(
      async ({ ctx, input }) =>
        await Promise.all(
          input.files.map(({ contentType, filePath }) =>
            createSignedUrl(ctx, { method: 'PUT', contentType, filePath }),
          ),
        ),
    ),
});

// For client to import just the types
export type AppRouter = typeof appRouter;

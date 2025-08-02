import z from 'zod';
import { publicProcedure, router } from './trpc';

export const appRouter = router({
  testapi: publicProcedure
    .input(z.object({ name: z.string().optional() }).optional())
    .query(({ input }) => (input?.name ? `Hello, ${input.name}` : 'Hello world')),
});

// For client to import just the types
export type AppRouter = typeof appRouter;

import { router } from './trpc';

export const appRouter = router({});

// For client to import just the types
export type AppRouter = typeof appRouter;

// Entry point of cloudflare workers
// From here call trpc when request hit /trpc
import router from './router';

export { ExpenseReindexer } from './workflows/ExpenseReindexer';

export default { ...router } satisfies ExportedHandler<Env>;

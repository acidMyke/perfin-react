// Entry point of cloudflare workers
// From here call trpc when request hit /trpc
import router from './router';

export { UserExpenseReindexer } from './workflows/UserExpenseReindexer';

export default { ...router } satisfies ExportedHandler<Env>;

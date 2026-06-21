// Entry point of cloudflare workers
// From here call trpc when request hit /trpc
import router from './router';

export { VersionTwoDataMigrator } from './workflows/VersionTwoDataMigrator';
export { UserExpenseReindexer } from './workflows/UserExpenseReindexer';

export default { ...router } satisfies ExportedHandler<Env>;

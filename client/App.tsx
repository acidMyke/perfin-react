import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './trpc';
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <></>
    </QueryClientProvider>
  );
}

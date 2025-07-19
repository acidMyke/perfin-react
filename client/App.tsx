import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './trpc';
import TestPage from './pages/TestPage';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TestPage></TestPage>
    </QueryClientProvider>
  );
}

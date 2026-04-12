import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { RouterProvider, createRouteMask, createRouter } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '#client/trpc';
import { routeTree } from './routeTree.gen';

const expenseItemSubpageMask = createRouteMask({
  routeTree,
  from: '/expenses/$expenseId/items/$indexStr',
  to: '/expenses/$expenseId',
});

const expenseGeoSubpageMask = createRouteMask({
  routeTree,
  from: '/expenses/$expenseId/geolocation',
  to: '/expenses/$expenseId',
});

const router = createRouter({
  routeTree,
  defaultPreload: 'viewport',
  defaultPreloadStaleTime: 0,
  routeMasks: [expenseItemSubpageMask, expenseGeoSubpageMask],
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ExpenseContextProvider } from './-context';

export const Route = createFileRoute('/_authenticated/expenses')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ExpenseContextProvider>
      <Outlet />
    </ExpenseContextProvider>
  );
}

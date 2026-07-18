import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/start')({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_authenticated/expenses/$expenseId/pre"!</div>;
}

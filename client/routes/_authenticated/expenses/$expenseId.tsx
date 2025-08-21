import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../../../components/PageHeader';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className='mx-auto max-w-lg px-2'>
      <PageHeader title='Expense detail' showBackButton />
    </div>
  );
}

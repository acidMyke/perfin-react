import { PageHeader } from '#client/components/PageHeader';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/expenses/search')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className='mx-auto max-w-lg px-2'>
      <PageHeader title='Expenses search'>
        <PageHeader.LeftLink to='/expenses' />
      </PageHeader>
    </div>
  );
}

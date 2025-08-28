import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../../../components/PageHeader';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/settings/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className='mx-auto flex max-w-md flex-col gap-4'>
      <PageHeader title='Settings' />
      <Link
        to='/settings/manage-subjects'
        search={{ type: 'accounts' }}
        className='btn btn-block btn-xl btn-ghost bg-base-200/25'
      >
        <h3 className='inline-block text-2xl'>Manage accounts</h3>
        <ChevronRight className='ml-auto inline-block' />
      </Link>
      <Link
        to='/settings/manage-subjects'
        search={{ type: 'categories' }}
        className='btn btn-block btn-xl btn-ghost bg-base-200/25'
      >
        <h3 className='inline-block text-2xl'>Manage categories</h3>
        <ChevronRight className='ml-auto inline-block' />
      </Link>
      <button className='btn btn-error btn-lg btn-block' onClick={() => {}}>
        Logout
      </button>
    </div>
  );
}

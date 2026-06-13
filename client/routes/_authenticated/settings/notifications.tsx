import { PageHeader } from '#client/components/PageHeader';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/settings/notifications')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className='mx-auto flex max-w-md flex-col'>
      <PageHeader title='Notifications' />

      <label className='label text-primary-content w-full justify-between px-5'>
        Show notification on this device
        <input
          type='checkbox'
          className='toggle-primary toggle toggle-xl'
          onChange={e => {
            // todo
          }}
        />
      </label>
    </div>
  );
}

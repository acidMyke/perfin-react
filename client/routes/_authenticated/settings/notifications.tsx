import { PageHeader } from '#client/components/PageHeader';
import { subscribeToPush } from '#client/registerSW';
import { queryClient, trpc } from '#client/trpc';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/settings/notifications')({
  component: RouteComponent,
});

function RouteComponent() {
  const notiStateQuery = useSuspenseQuery(trpc.webpush.get.queryOptions());
  const subToWebPushMutation = useMutation({
    mutationFn: () => subscribeToPush(),
    onSuccess: data => setupWebPushMutation.mutate(data),
  });
  const setupWebPushMutation = useMutation(
    trpc.webpush.setup.mutationOptions({
      onMutate: () => queryClient.setQueryData(trpc.webpush.get.queryKey(), { isEnabled: true }),
      onSettled: () => queryClient.invalidateQueries(trpc.webpush.get.queryFilter()),
    }),
  );
  const disableWebPushMutation = useMutation(
    trpc.webpush.disable.mutationOptions({
      onMutate: () => queryClient.setQueryData(trpc.webpush.get.queryKey(), { isEnabled: false }),
      onSettled: () => queryClient.invalidateQueries(trpc.webpush.get.queryFilter()),
    }),
  );

  return (
    <div className='mx-auto flex max-w-md flex-col'>
      <PageHeader title='Notifications' showBackButton />

      <label className='label text-primary-content w-full justify-between px-5'>
        Show notification on this device
        <input
          type='checkbox'
          checked={notiStateQuery.data.isEnabled}
          className='toggle checked:toggle-primary toggle-xl'
          onChange={() => {
            if (notiStateQuery.data.isEnabled) {
              disableWebPushMutation.mutate();
            } else {
              subToWebPushMutation.mutate();
            }
          }}
        />
      </label>
    </div>
  );
}

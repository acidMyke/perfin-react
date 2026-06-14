import { PageHeader } from '#client/components/PageHeader';
import { subscribeToPush, unsubscribeToPush } from '#client/registerSW';
import { queryClient, trpc } from '#client/trpc';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/_authenticated/settings/notifications')({
  component: RouteComponent,
  loader: () => queryClient.ensureQueryData(trpc.webpush.get.queryOptions()),
});

function RouteComponent() {
  const [error, setError] = useState<string | null>(null);
  const notiStateQuery = useSuspenseQuery(trpc.webpush.get.queryOptions());
  const subToWebPushMutation = useMutation({
    mutationFn: () => (setError(null), subscribeToPush()),
    onSuccess: data => setupWebPushMutation.mutate(data),
    onError: err => setError(err instanceof Error ? err.message : 'Failed to subscribe to notifications'),
  });
  const setupWebPushMutation = useMutation(
    trpc.webpush.setup.mutationOptions({
      onMutate: () => (setError(null), queryClient.setQueryData(trpc.webpush.get.queryKey(), { isEnabled: true })),
      onSettled: () => queryClient.invalidateQueries(trpc.webpush.get.queryFilter()),
      onError: () => setError('Failed to enable notifications'),
    }),
  );
  const disableWebPushMutation = useMutation(
    trpc.webpush.disable.mutationOptions({
      onMutate: () => (setError(null), queryClient.setQueryData(trpc.webpush.get.queryKey(), { isEnabled: false })),
      onSettled: () => queryClient.invalidateQueries(trpc.webpush.get.queryFilter()),
      onError: () => setError('Failed to disable notifications'),
    }),
  );
  const unsubtoWebPushMutation = useMutation({
    mutationFn: () => (setError(null), unsubscribeToPush()),
    onError: err => setError(err instanceof Error ? err.message : 'Failed to unsubscribe to notifications'),
  });

  const isLoading =
    subToWebPushMutation.isPending ||
    setupWebPushMutation.isPending ||
    disableWebPushMutation.isPending ||
    unsubtoWebPushMutation.isPending;

  return (
    <div className='mx-auto flex max-w-md flex-col'>
      <PageHeader title='Notifications' showBackButton />

      <label className='label text-primary-content w-full justify-between px-5'>
        Show notification on this device
        <input
          type='checkbox'
          disabled={isLoading}
          checked={notiStateQuery.data.isEnabled}
          className='toggle checked:toggle-primary toggle-xl'
          onChange={() => {
            if (notiStateQuery.data.isEnabled) {
              disableWebPushMutation.mutate();
              unsubtoWebPushMutation.mutate();
            } else {
              subToWebPushMutation.mutate();
            }
          }}
        />
      </label>

      {error && <div className='text-error mt-2 px-5 text-sm'>{error}</div>}
    </div>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { queryClient, trpc } from '../../../trpc';
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { PageHeader } from '../../../components/PageHeader';
import { CircleCheck, CircleX, Pencil, Trash } from 'lucide-react';
import { monthDayFormat } from '../../../utils';

export const Route = createFileRoute('/_authenticated/settings/passkey')({
  component: RouteComponent,
  loader: () => queryClient.ensureQueryData(trpc.passkey.list.queryOptions()),
});

function RouteComponent() {
  const {
    data: { passkeys },
  } = useSuspenseQuery(trpc.passkey.list.queryOptions());
  const generateOptionsMutation = useMutation(
    trpc.passkey.registration.generateOptions.mutationOptions({
      onSuccess: data => startRegistrationMutation.mutateAsync(data),
    }),
  );
  const startRegistrationMutation = useMutation({
    mutationFn: (optionsJSON: PublicKeyCredentialCreationOptionsJSON) => startRegistration({ optionsJSON }),
    onSuccess: data => verifyResponseMutation.mutateAsync(data),
  });
  const verifyResponseMutation = useMutation(
    trpc.passkey.registration.verifyResponse.mutationOptions({
      onSuccess: () => queryClient.refetchQueries(trpc.passkey.list.queryOptions()),
    }),
  );

  const isBusy =
    generateOptionsMutation.isPending || startRegistrationMutation.isPending || verifyResponseMutation.isPending;
  const rawError = verifyResponseMutation.error ?? startRegistrationMutation.error ?? generateOptionsMutation.error;
  const isSuccess = verifyResponseMutation.isSuccess;

  return (
    <div className='mx-auto flex max-w-md flex-col gap-4'>
      <PageHeader title='Passkeys' showBackButton />

      <div className='flex h-72 flex-col gap-4'>
        {passkeys.map(({ id, createdAt, nickname }) => (
          <div className='grid auto-cols-min grid-cols-1 gap-2' key={id}>
            <h3 className='text-lg font-bold'>
              {nickname ?? `Passkey created at ${monthDayFormat.format(new Date(createdAt))}`}
            </h3>
            <button className='btn btn-square btn-sm col-start-2'>
              <Pencil />
            </button>
            <button className='btn btn-square btn-sm col-start-3'>
              <Trash />
            </button>
            {nickname && <p className='text-sm'>{monthDayFormat.format(new Date(createdAt))}</p>}
          </div>
        ))}
      </div>

      {rawError ? (
        <div role='alert' className='alert alert-error'>
          <CircleX />
          {'name' in rawError && rawError.name == 'NotAllowedError' ? 'You cancelled the scan.' : rawError.message}
        </div>
      ) : isBusy ? (
        <div className='skeleton alert h-12.5'></div>
      ) : isSuccess ? (
        <div role='alert' className='alert'>
          <CircleCheck />
          <span>Passkey added successfully!</span>
        </div>
      ) : (
        <div className='h-12.5'></div>
      )}

      <button className='btn btn-primary w-full' onClick={() => generateOptionsMutation.mutate()} disabled={isBusy}>
        {isBusy ? 'Processing...' : 'Enroll new device'}
      </button>
    </div>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { trpc } from '../../../trpc';
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { useMutation } from '@tanstack/react-query';
import { PageHeader } from '../../../components/PageHeader';
import { CircleCheck, CircleX } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/settings/passkey')({
  component: RouteComponent,
  preload: false,
});

function RouteComponent() {
  const generateOptionsMutation = useMutation(
    trpc.passkey.generateOptions.mutationOptions({ onSuccess: data => startRegistrationMutation.mutateAsync(data) }),
  );
  const startRegistrationMutation = useMutation({
    mutationFn: (optionsJSON: PublicKeyCredentialCreationOptionsJSON) => startRegistration({ optionsJSON }),
    onSuccess: data => verifyResponseMutation.mutateAsync(data),
  });
  const verifyResponseMutation = useMutation(trpc.passkey.verifyResponse.mutationOptions());

  const isBusy =
    generateOptionsMutation.isPending || startRegistrationMutation.isPending || verifyResponseMutation.isPending;
  const rawError = verifyResponseMutation.error ?? startRegistrationMutation.error ?? generateOptionsMutation.error;
  const isSuccess = verifyResponseMutation.isSuccess;

  return (
    <div className='mx-auto flex max-w-md flex-col gap-4'>
      <PageHeader title='Passkeys' showBackButton />

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
      ) : undefined}

      <button className='btn btn-primary w-full' onClick={() => generateOptionsMutation.mutate()} disabled={isBusy}>
        {isBusy ? 'Processing...' : 'Enroll new device'}
      </button>
    </div>
  );
}

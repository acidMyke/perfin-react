import { createFileRoute } from '@tanstack/react-router';
import { handleFormMutateAsync, queryClient, trpc } from '../../../trpc';
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { PageHeader } from '../../../components/PageHeader';
import { CircleCheck, CircleX, Form, Pencil, Trash } from 'lucide-react';
import { monthDayFormat } from '../../../utils';
import { useRef } from 'react';
import { useAppForm } from '../../../components/Form';

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
  const updatePasskeyMutation = useMutation(
    trpc.passkey.update.mutationOptions({
      onSuccess: () => {
        form.reset();
        modalRef.current?.close();
        queryClient.refetchQueries(trpc.passkey.list.queryOptions());
      },
    }),
  );
  const deletePasskeyMutation = useMutation(
    trpc.passkey.delete.mutationOptions({
      onSuccess: () => {
        form.reset({ passkeyId: '', operation: 'update', nickname: null, createdDate: new Date() });
        modalRef.current?.close();
        queryClient.refetchQueries(trpc.passkey.list.queryOptions());
      },
    }),
  );
  const form = useAppForm({
    defaultValues: {
      passkeyId: '',
      operation: 'update' as 'update' | 'delete',
      nickname: null as string | null,
      createdDate: new Date(),
    },
    validators: {
      onSubmitAsync: ({ value }) => {
        const { passkeyId, nickname } = value;
        if (value.operation === 'update') {
          return handleFormMutateAsync(updatePasskeyMutation.mutateAsync({ passkeyId, nickname }));
        } else {
          return handleFormMutateAsync(deletePasskeyMutation.mutateAsync({ passkeyId }));
        }
      },
    },
  });
  const modalRef = useRef<HTMLDialogElement>(null);

  const isBusy =
    generateOptionsMutation.isPending || startRegistrationMutation.isPending || verifyResponseMutation.isPending;
  const rawError = verifyResponseMutation.error ?? startRegistrationMutation.error ?? generateOptionsMutation.error;
  const isSuccess = verifyResponseMutation.isSuccess;

  return (
    <div className='mx-auto flex max-w-md flex-col gap-4'>
      <PageHeader title='Passkeys' showBackButton />

      <div className='flex h-72 flex-col gap-4'>
        {passkeys.map(({ id, createdAt, nickname }) => {
          const createdDate = new Date(createdAt);
          return (
            <div className='grid auto-cols-min auto-rows-min grid-cols-1 gap-x-2' key={id}>
              <h3 className='text-lg font-bold'>
                {nickname ?? `Passkey created at ${monthDayFormat.format(createdDate)}`}
              </h3>
              <button
                className='btn btn-square col-start-2 row-span-2'
                onClick={() => {
                  form.reset({ passkeyId: id, operation: 'update', nickname, createdDate });
                  modalRef.current?.showModal();
                }}
              >
                <Pencil />
              </button>
              <button
                className='btn btn-square col-start-3 row-span-2'
                onClick={() => {
                  form.reset({ passkeyId: id, operation: 'delete', nickname, createdDate });
                  modalRef.current?.showModal();
                }}
              >
                <Trash />
              </button>
              {nickname && <p className='text-sm'>Created at {monthDayFormat.format(createdDate)}</p>}
            </div>
          );
        })}
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

      <dialog className='modal' ref={modalRef}>
        <form.AppForm>
          <div className='modal-box'>
            <form.AppField
              name='operation'
              children={({ state: { value: operation } }) => (
                <>
                  <h3 className='text-lg font-bold'>
                    {operation === 'update' ? 'Give it a new name' : 'Confirm delete?'}
                  </h3>
                  {operation === 'delete' && <p className='indent-2 italic'>This action is permanent</p>}
                  <form.AppField
                    name='createdDate'
                    children={({ state: { value: createdDate } }) => (
                      <form.AppField
                        name='nickname'
                        children={({ state: { value: nickname }, TextInput }) =>
                          operation === 'update' ? (
                            <TextInput label='Nickname' type='text' nullIfEmpty />
                          ) : (
                            <p className='mt-4'>
                              Press confirm to delete the passkey "
                              {nickname ?? `Passkey created at ${monthDayFormat.format(createdDate)}`}"
                            </p>
                          )
                        }
                      />
                    )}
                  />
                </>
              )}
            />
            <div className='modal-action'>
              <button
                type='button'
                className='btn btn-lg btn-error w-min'
                onClick={() => {
                  form.reset({ passkeyId: '', operation: 'update', nickname: null, createdDate: new Date() });
                  modalRef.current?.close();
                }}
              >
                Cancel
              </button>
              <form.SubmitButton label='Confirm' buttonCn='w-min mt-0' allowPristine />
            </div>
          </div>
        </form.AppForm>
      </dialog>
    </div>
  );
}

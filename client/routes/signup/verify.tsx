import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { handleFormMutateAsync, queryClient, trpc } from '../../trpc';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAppForm } from '../../components/Form';
import { sleep } from '../../../server/lib/utils';

export const Route = createFileRoute('/signup/verify')({
  component: RouteComponent,
  validateSearch(search) {
    if (!search || typeof search.code !== 'string') {
      throw notFound();
    }

    return { code: search.code as string, username: search.username as string | undefined };
  },
  loaderDeps: ({ search }) => ({ code: search.code }),
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const { code, username } = Route.useSearch();
  const verificationMutation = useMutation(trpc.session.signUpVerify.mutationOptions());
  const finalizeMutation = useMutation(
    trpc.session.signUpFinalize.mutationOptions({
      onSuccess() {
        Promise.allSettled([queryClient.refetchQueries(trpc.whoami.pathFilter()), sleep(2000)]).then(async () => {
          navigate({ to: '/dashboard' });
        });
      },
      onError() {
        form.resetField('password');
      },
    }),
  );

  const form = useAppForm({
    defaultValues: {
      username: username ?? '',
      password: '',
      confirmPassword: '',
    },
    validators: {
      async onSubmitAsync({ value }) {
        const { username, password } = value;
        const code = verificationMutation.data?.code!;
        return await handleFormMutateAsync(finalizeMutation.mutateAsync({ code, username, password }));
      },
    },
  });

  useEffect(() => {
    verificationMutation.mutateAsync({ code });
  }, []);

  if (verificationMutation.isPending || verificationMutation.isIdle) {
    return (
      <div className='mx-auto max-w-md'>
        <h1 className='mt-20 text-center text-3xl font-black'>Sign Up</h1>
        <p className='mt-20 text-center'>Verifying code...</p>
      </div>
    );
  } else if (verificationMutation.isSuccess) {
    if (!finalizeMutation.isSuccess) {
      return (
        <div className='mx-auto max-w-md'>
          <h1 className='mt-20 text-center text-3xl font-black'>Sign Up</h1>
          <label htmlFor='' className='floating-label mt-8'>
            <input
              type='text'
              name='email'
              id='email'
              className='input input-primary input-lg w-full'
              value={verificationMutation.data.email}
              readOnly
            />
          </label>
          <form.AppForm>
            <form.AppField name='username'>
              {({ TextInput }) => <TextInput type='text' label='Username' />}
            </form.AppField>
            <form.AppField name='password'>
              {({ TextInput }) => <TextInput type='password' label='Password' />}
            </form.AppField>
            <form.AppField
              name='confirmPassword'
              validators={{
                onChangeListenTo: ['password'],
                onChange: ({ value, fieldApi }) => {
                  if (value !== fieldApi.form.getFieldValue('password')) {
                    return 'Passwords do not match';
                  }
                  return undefined;
                },
              }}
            >
              {({ TextInput }) => <TextInput type='password' label='Confirm password' />}
            </form.AppField>
            <form.StatusMessage />
            <form.SubmitButton label='Submit' inProgressLabel='Submitting' doneLabel='Submitted' />
          </form.AppForm>
        </div>
      );
    }
  } else {
    return (
      <div className='mx-auto max-w-md'>
        <h1 className='mt-20 text-center text-3xl font-black'>Sign Up</h1>
        <p className='mt-20 text-center'>Oops! The code might be expired.</p>
        <p className='mt-20 text-center'>
          <span>Please </span>
          <Link to='/signup' className='link'>
            sign up
          </Link>
          <span> again</span>
        </p>
      </div>
    );
  }
}

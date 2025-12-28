import { createFileRoute, Link } from '@tanstack/react-router';
import { handleFormMutateAsync, queryClient, trpc } from '../../trpc';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAppForm } from '../../components/Form';
import { sleep } from '../../../server/lib/utils';
import { PageHeader } from '../../components/PageHeader';
import z from 'zod';

export const Route = createFileRoute('/signup/verify')({
  component: RouteComponent,
  validateSearch(search) {
    return { code: search.code as string | undefined, username: search.username as string | undefined };
  },
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
        form.resetField('confirmPassword');
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

  const [autoSubmissionTimeout, setAutoSubmissionTimeout] = useState<ReturnType<typeof setTimeout>>();
  const otpForm = useAppForm({
    defaultValues: { otp: '' },
    validators: {
      onSubmitAsync: ({ value }) => handleFormMutateAsync(verificationMutation.mutateAsync({ code: value.otp })),
    },
  });

  useEffect(() => {
    if (code) {
      otpForm.setFieldValue('otp', code);
    }
  }, []);

  if (!verificationMutation.isSuccess) {
    return (
      <otpForm.AppForm>
        <div className='mx-auto mt-20 max-w-md'>
          <PageHeader title='Check your inbox' />
          <p className='mt-2 mb-8 text-center text-sm text-gray-500'>
            We've sent a code to your email. Enter it below or simply click the link inside to verify.
          </p>
          <otpForm.AppField
            name='otp'
            listeners={{
              onChangeDebounceMs: 200,
              onChange: ({ value }) => {
                setAutoSubmissionTimeout(timeout => {
                  if (timeout) {
                    clearTimeout(timeout);
                  }
                  if (value.length === 6) {
                    return setTimeout(() => {
                      otpForm.handleSubmit();
                      setAutoSubmissionTimeout(undefined);
                    }, 300);
                  }
                });
              },
            }}
            children={({ OtpInput }) => <OtpInput />}
          />
          <form.StatusMessage />
          <form.SubmitButton
            showSpinner={!!autoSubmissionTimeout}
            label={!!autoSubmissionTimeout ? 'Auto submitting' : 'Verify'}
            inProgressLabel='Verifying'
          />
        </div>
      </otpForm.AppForm>
    );
  } else if (verificationMutation.isSuccess) {
    if (!finalizeMutation.isSuccess) {
      return (
        <div className='mx-auto max-w-md'>
          <h1 className='mt-20 text-center text-3xl font-black'>Sign Up</h1>
          <label htmlFor='' className='floating-label mt-8'>
            <span>Email</span>
            <input
              type='text'
              name='email'
              id='email'
              className='input input-primary input-lg w-full'
              value={verificationMutation.data.email}
              readOnly
              disabled
            />
          </label>
          <form.AppForm>
            <form.AppField
              name='username'
              validators={{
                onChange: z
                  .string()
                  .nonempty()
                  .max(100, 'Input too long')
                  .regex(/^[a-zA-Z0-9_ -]*$/, 'Invalid characters detected'),
              }}
            >
              {({ TextInput }) => <TextInput type='text' label='Username' />}
            </form.AppField>
            <form.AppField
              name='password'
              validators={{
                onChange: z
                  .string()
                  .min(12)
                  .regex(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/, 'Password too week'),
              }}
            >
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
    } else {
      return (
        <div className='mx-auto max-w-md'>
          <h1 className='mt-20 text-center text-3xl font-black'>Sign Up</h1>
          <p className='mt-20 text-center'>Creating account...</p>
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

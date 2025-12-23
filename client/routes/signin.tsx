import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useRouter, redirect, Link } from '@tanstack/react-router';
import { whoamiQueryOptions } from '../queryOptions';
import { trpc, queryClient, handleFormMutateAsync } from '../trpc';
import { sleep } from '../../server/lib/utils';
import { useAppForm } from '../components/Form';
import { ChevronRight } from 'lucide-react';
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { useCallback, useEffect, useRef } from 'react';
import z from 'zod';

export const Route = createFileRoute('/signin')({
  component: RouteComponent,
  validateSearch(search) {
    return {
      redirect: search.redirect as string | undefined,
    };
  },
  async beforeLoad({ search }) {
    const { isAuthenticated } = await queryClient.ensureQueryData(whoamiQueryOptions);
    if (!isAuthenticated) {
      return;
    }
    if (search.redirect) {
      throw redirect({ href: search.redirect });
    } else {
      throw redirect({ to: '/dashboard' });
    }
  },
});

function RouteComponent() {
  const search = Route.useSearch();
  const router = useRouter();
  const invalidateAndRedirect = useCallback(
    () =>
      Promise.allSettled([queryClient.refetchQueries(trpc.whoami.pathFilter()), sleep(2000)]).then(async () => {
        if (search.redirect) {
          await router.navigate({ href: search.redirect });
        } else {
          await router.navigate({ to: '/dashboard', from: '/signin' });
        }
      }),
    [router.navigate],
  );

  const passkeyAuthOptionsMutation = useMutation(
    trpc.passkey.authentication.generateOptions.mutationOptions({
      onSuccess: (optionsJSON, variables) =>
        startPasskeyAuthMutation.mutate({ optionsJSON, withoutUsername: !variables!.username }),
    }),
  );
  const startPasskeyAuthMutation = useMutation({
    onSuccess: data => verifyPasskeyAuthMutation.mutateAsync(data),
    mutationFn: ({
      optionsJSON,
      withoutUsername,
    }: {
      optionsJSON: PublicKeyCredentialRequestOptionsJSON;
      withoutUsername: boolean;
    }) => startAuthentication({ optionsJSON, useBrowserAutofill: withoutUsername, verifyBrowserAutofillInput: false }),
  });
  const verifyPasskeyAuthMutation = useMutation(
    trpc.passkey.authentication.verifyResponse.mutationOptions({
      onSuccess: () => invalidateAndRedirect(),
    }),
  );
  const signInMutation = useMutation(
    trpc.session.signIn.mutationOptions({
      onSuccess: () => invalidateAndRedirect(),
      onError: () => void form.resetField('password'),
    }),
  );
  const form = useAppForm({
    defaultValues: { username: '', password: '' },
    validators: {
      onChange: z.object({
        username: z.string(),
        password: z.string(),
      }),
      onSubmitAsync: ({ value, signal }) => {
        signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.session.signIn.mutationKey() });
        if (!value.password) {
          return handleFormMutateAsync(passkeyAuthOptionsMutation.mutateAsync({ username: value.username }));
        } else {
          return handleFormMutateAsync(signInMutation.mutateAsync(value));
        }
      },
    },
  });
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      passkeyAuthOptionsMutation.mutate();
    }
  }, []);

  const isSubmitting = verifyPasskeyAuthMutation.isPending || signInMutation.isPending;
  const isSubmitSuccessful = verifyPasskeyAuthMutation.isSuccess || signInMutation.isSuccess;
  const userName = verifyPasskeyAuthMutation.data?.userName || signInMutation.data?.userName;

  return (
    <form
      className='mx-auto max-w-md'
      onSubmit={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <h1 className='mt-20 text-center text-3xl font-black'>Sign In</h1>
      <form.AppForm>
        <form.AppField name='username'>
          {({ TextInput }) => <TextInput type='text' label='Username' autoComplete='username webauthn' />}
        </form.AppField>
        <form.AppField name='password'>
          {({ TextInput }) => <TextInput type='password' label='Password' />}
        </form.AppField>
        <form.Subscribe
          selector={state => [
            state.isPristine,
            state.canSubmit,
            state.values.password !== '',
            state.values.username !== '',
          ]}
        >
          {([isPristine, canSubmit, passwordNotEmpty]) => (
            <button
              type='button'
              className='btn btn-primary btn-lg btn-block mt-8'
              disabled={isPristine || !canSubmit}
              onClick={() => form.handleSubmit()}
            >
              {isSubmitting && <span className='loading loading-dots loading-md'></span>}
              {isSubmitting
                ? 'Signing in...'
                : isSubmitSuccessful
                  ? `Welcome, ${userName}`
                  : passwordNotEmpty
                    ? 'Sign in'
                    : 'Sign in with passkey'}
            </button>
          )}
        </form.Subscribe>
      </form.AppForm>
      <p className='mt-4 text-center'>Don't have an account?</p>
      <Link to='/signup' className='link block w-full text-center'>
        Sign up here <ChevronRight className='inline-block' />
      </Link>
    </form>
  );
}

import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useRouter, redirect } from '@tanstack/react-router';
import { whoamiQueryOptions } from '../queryOptions';
import { trpc, queryClient, handleFormMutateAsync } from '../trpc';
import { sleep } from '../../server/lib/utils';
import { signInValidator } from '../../server/validators';
import { useAppForm } from '../components/Form';

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
  const signInMutation = useMutation(
    trpc.session.signIn.mutationOptions({
      onSuccess() {
        Promise.allSettled([queryClient.refetchQueries(trpc.whoami.pathFilter()), sleep(2000)]).then(async () => {
          if (search.redirect) {
            await router.navigate({ href: search.redirect });
          } else {
            await router.navigate({ to: '/dashboard', from: '/signin' });
          }
        });
      },
      onError() {
        form.resetField('password');
      },
    }),
  );
  const form = useAppForm({
    defaultValues: { username: '', password: '' },
    validators: {
      onChange: signInValidator,
      onSubmitAsync: ({ value, signal }) => {
        signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.session.signIn.mutationKey() });
        return handleFormMutateAsync(signInMutation.mutateAsync(value));
      },
    },
  });

  return (
    <form
      className='mx-auto max-w-md'
      onSubmit={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <h1 className='mt-20 text-center text-3xl font-black'>Perfin Sign In</h1>
      <form.AppForm>
        <form.AppField name='username'>{({ TextInput }) => <TextInput type='text' label='Username' />}</form.AppField>
        <form.AppField name='password'>
          {({ TextInput }) => <TextInput type='password' label='Password' />}
        </form.AppField>
        <form.SubmitButton
          label='Sign In'
          inProgressLabel='Signing In...'
          doneLabel={`Welcome, ${signInMutation.data?.userName}`}
        />
      </form.AppForm>
    </form>
  );
}

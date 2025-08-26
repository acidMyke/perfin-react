import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { handleFormMutateAsync, queryClient, trpc } from '../trpc';
import { whoamiQueryOptions } from '../queryOptions';
import { useMutation } from '@tanstack/react-query';
import { sleep } from '@trpc/server/unstable-core-do-not-import';
import { useAppForm } from '../components/Form';
import { signUpValidator } from '../../server/validators';

export const Route = createFileRoute('/signup')({
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
  const signUpMutation = useMutation(
    trpc.session.signUp.mutationOptions({
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
      onChange: signUpValidator,
      onSubmitAsync: ({ value, signal }) => {
        signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.session.signIn.mutationKey() });
        return handleFormMutateAsync(signUpMutation.mutateAsync(value));
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
      <h1 className='mt-20 text-center text-3xl font-black'>Sign Up</h1>
      <form.AppForm>
        <form.AppField name='username'>
          {({ TextInput }) => <TextInput type='text' label='Username' marginTop={8} />}
        </form.AppField>
        <form.AppField name='password'>
          {({ TextInput }) => <TextInput type='password' label='Password' marginTop={8} />}
        </form.AppField>
        <form.SubmitButton
          label='Sign Up'
          inProgressLabel='Signing In...'
          doneLabel={`Welcome, ${signUpMutation.data?.userName}`}
        />
      </form.AppForm>
    </form>
  );
}

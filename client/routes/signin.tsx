import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useRouter, redirect } from '@tanstack/react-router';
import { whoamiQueryOptions } from '../queryOptions';
import { trpc, queryClient, handleFormMutateAsync } from '../trpc';
import { sleep } from '../../server/lib';
import { signInValidator } from '../../server/validators';
import { FieldError } from '../components/FieldError';

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
    }),
  );
  const signInForm = useForm({
    defaultValues: {
      username: '',
      password: '',
    },
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
      <signInForm.Field name='username'>
        {field => (
          <>
            <label htmlFor={field.name} className='floating-label mt-12'>
              <input
                type='text'
                id={field.name}
                name={field.name}
                placeholder='Username'
                className='input input-primary input-xl w-full'
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
              />
              <span>Username</span>
            </label>
            <FieldError field={field} />
          </>
        )}
      </signInForm.Field>

      <signInForm.Field name='password'>
        {field => (
          <>
            <label htmlFor={field.name} className='floating-label mt-12'>
              <input
                type='password'
                id={field.name}
                name={field.name}
                placeholder='Password'
                className='input input-primary input-xl w-full'
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
              />
              <span>Password</span>
            </label>
            <FieldError field={field} />
          </>
        )}
      </signInForm.Field>

      <signInForm.Subscribe selector={state => [state.isPristine, state.canSubmit, state.isSubmitting]}>
        {([isPristine, canSubmit, isSubmitting]) => (
          <button
            type='button'
            className='btn btn-primary btn-lg btn-block mt-12'
            disabled={isPristine || !canSubmit || isSubmitting}
            onClick={() => signInForm.handleSubmit()}
          >
            {isSubmitting && <span className='loading loading-dots loading-md'></span>}
            {isSubmitting
              ? 'Signing In...'
              : signInMutation.isSuccess
                ? `Welcome back, ${signInMutation.data.userName}`
                : 'Sign In'}
          </button>
        )}
      </signInForm.Subscribe>
    </form>
  );
}

import { createFileRoute, redirect } from '@tanstack/react-router';
import { handleFormMutateAsync, queryClient, trpc } from '../../trpc';
import { whoamiQueryOptions } from '../../queryOptions';
import { useMutation } from '@tanstack/react-query';
import { useAppForm } from '../../components/Form';
import z from 'zod';

export const Route = createFileRoute('/signup/')({
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
  const signUpEmail = useMutation(trpc.session.signUpEmail.mutationOptions());
  const form = useAppForm({
    defaultValues: { name: '', email: '' },
    validators: {
      onSubmitAsync: ({ value, signal }) => {
        signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.session.signIn.mutationKey() });
        return handleFormMutateAsync(signUpEmail.mutateAsync(value));
      },
    },
  });
  return (
    <div className='mx-auto max-w-md'>
      <h1 className='mt-20 text-center text-3xl font-black'>Sign Up</h1>
      {signUpEmail.isSuccess && signUpEmail.data.success ? (
        <p>Please click the link in the email to verify!</p>
      ) : (
        <form.AppForm>
          <form.AppField validators={{ onChange: z.email() }} name='email'>
            {({ TextInput }) => <TextInput type='email' label='Email' />}
          </form.AppField>
          <form.AppField validators={{ onChange: z.string().min(4) }} name='name'>
            {({ TextInput }) => <TextInput type='text' label='Username' />}
          </form.AppField>
          <form.SubmitButton label='Sign me up' inProgressLabel='Checking...' />
        </form.AppForm>
      )}
    </div>
  );
}

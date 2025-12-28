import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { handleFormMutateAsync, queryClient, trpc } from '../../trpc';
import { whoamiQueryOptions } from '../../queryOptions';
import { useMutation } from '@tanstack/react-query';
import { useAppForm } from '../../components/Form';
import z from 'zod';
import { ChevronRight } from 'lucide-react';

export const Route = createFileRoute('/signup/')({
  component: RouteComponent,
  async beforeLoad() {
    const { isAuthenticated } = await queryClient.ensureQueryData(whoamiQueryOptions);
    if (!isAuthenticated) {
      return;
    }
    throw redirect({ to: '/dashboard' });
  },
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const signUpEmail = useMutation(
    trpc.session.signUpEmail.mutationOptions({
      onSuccess: async () => {
        await navigate({ to: '/signup/verify', search: { code: undefined, username: form.getFieldValue('name') } });
      },
    }),
  );
  const form = useAppForm({
    defaultValues: { name: '', email: '' },
    validators: {
      onSubmitAsync: ({ value }) => {
        return handleFormMutateAsync(signUpEmail.mutateAsync(value));
      },
    },
  });

  return (
    <div className='mx-auto max-w-md'>
      <h1 className='mt-20 text-center text-3xl font-black'>Sign Up</h1>
      <form.AppForm>
        <form.AppField validators={{ onChange: z.email() }} name='email'>
          {({ TextInput }) => <TextInput type='email' label='Email' />}
        </form.AppField>
        <form.AppField validators={{ onChange: z.string().min(4) }} name='name'>
          {({ TextInput }) => <TextInput type='text' label='Username' />}
        </form.AppField>
        <form.SubmitButton label='Sign me up' inProgressLabel='Checking...' />
        <p className='mt-4 text-center'>Already have an account?</p>
        <Link to='/signin' search={{ redirect: undefined }} className='link block w-full text-center'>
          Sign in here <ChevronRight className='inline-block' />
        </Link>
      </form.AppForm>
    </div>
  );
}

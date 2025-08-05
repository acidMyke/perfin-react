import { useForm } from '@tanstack/react-form';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/signin')({
  component: RouteComponent,
});

function RouteComponent() {
  const { Field: SignInFormField } = useForm({
    defaultValues: {
      username: '',
      password: '',
    },
    onSubmit: ({ value }) => {
      console.log('Form submitted', value);
    },
  });

  return (
    <div className='mx-auto max-w-md'>
      <h1 className='mt-20 text-center text-3xl font-black'>Perfin Sign In</h1>
      <SignInFormField
        name='username'
        validators={{ onChange: ({ value }) => (value.length <= 0 ? 'Cannot be empty' : undefined) }}
      >
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
            <p role='alert' className='text-error h-[1em]'>
              {field.state.meta.errors.join(', ')}
            </p>
          </>
        )}
      </SignInFormField>

      <SignInFormField
        name='password'
        validators={{ onChange: ({ value }) => (value.length <= 0 ? 'Cannot be empty' : undefined) }}
      >
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
            <p role='alert' className='text-error h-[1em]'>
              {field.state.meta.errors.join(', ')}
            </p>
          </>
        )}
      </SignInFormField>

      <button type='button' className='btn btn-primary btn-lg mt-12 w-full'>
        Sign In
      </button>
    </div>
  );
}

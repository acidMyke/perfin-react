import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/signin')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className='mx-auto max-w-md'>
      <h1 className='mt-20 text-center text-3xl font-black'>Perfin Sign In</h1>
      <label className='floating-label mt-12'>
        <input type='text' placeholder='Username' className='input input-primary input-xl w-full' />
        <span>Username</span>
      </label>
      <label className='floating-label mt-12'>
        <input type='password' placeholder='Password' className='input input-primary input-xl w-full' />
        <span>Password</span>
      </label>
      <button type='button' className='btn btn-primary btn-lg mt-12 w-full'>
        Sign In
      </button>
    </div>
  );
}

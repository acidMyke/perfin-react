import { createRootRoute, Link, linkOptions, Outlet } from '@tanstack/react-router';

const options = linkOptions([
  {
    to: '/',
    label: 'Home',
  },
  {
    to: '/',
    label: 'Test',
  },
]);

function Navbar() {
  return (
    <div className='navbar bg-base-100 shadow-sm'>
      <div className='navbar-start'>
        <a className='btn btn-ghost text-xl'>Perfin</a>
      </div>
      <div className='navbar-center hidden lg:flex'>
        <ul className='menu menu-horizontal px-1'>
          {options.map((options, index) => {
            return (
              <li key={index}>
                <Link className='btn btn-ghost drawer-button' activeProps={{ className: 'btn-active' }} {...options}>
                  {options.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className='navbar-end'></div>
    </div>
  );
}

function Root() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

export const Route = createRootRoute({
  component: Root,
});

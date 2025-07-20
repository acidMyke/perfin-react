import { createRootRoute, Link, linkOptions, Outlet } from '@tanstack/react-router';
import { ChartLine, ScrollText } from 'lucide-react';

const options = linkOptions([
  {
    to: '/dashboard',
    label: 'Dashboard',
    Icon: ChartLine,
  },
  {
    to: '/expenses/list',
    label: 'Expenses',
    Icon: ScrollText,
  },
]);

function NavDock() {
  return (
    <div className='dock dock-lg'>
      {options.map(options => {
        return (
          <Link key={options.to} activeProps={{ className: 'dock-active' }} {...options}>
            <options.Icon size='1.2em' />
            <span className='dock-label'>{options.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function Root() {
  return (
    <>
      <Outlet />
      <NavDock />
    </>
  );
}

export const Route = createRootRoute({
  component: Root,
});

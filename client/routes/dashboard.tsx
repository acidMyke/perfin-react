import { createFileRoute } from '@tanstack/react-router';
import { useWhoamiQuery } from '../hooks';

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
});

function RouteComponent() {
  const { isAuthenticated, userName } = useWhoamiQuery();

  if (isAuthenticated) {
    return <div>Hello {userName} </div>;
  }
  return <div>Who are you?</div>;
}

import { createFileRoute } from '@tanstack/react-router';
import { whoamiQueryOptions } from '../../queryOptions';
import { useSuspenseQuery } from '@tanstack/react-query';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: RouteComponent,
});

function RouteComponent() {
  const {
    data: { isAuthenticated, userName },
  } = useSuspenseQuery(whoamiQueryOptions);

  if (isAuthenticated) {
    return <div>Hello {userName} </div>;
  }
  return <div>Who are you?</div>;
}

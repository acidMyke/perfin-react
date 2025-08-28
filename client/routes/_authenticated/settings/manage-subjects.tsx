import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/settings/manage-subjects')({
  component: RouteComponent,
  validateSearch(search) {
    if (!search || typeof search.type !== 'string') {
      throw redirect({ to: '/settings' });
    }

    return {
      type: search.type,
    };
  },
});

function RouteComponent() {
  return <div>Hello "/_authenticated/settings/manage-accounts"!</div>;
}

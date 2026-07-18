import { createFileRoute, redirect } from '@tanstack/react-router';
import { setCurrentLocation, useExpenseForm } from './-common';
import { useEffect } from 'react';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/start')({
  component: RouteComponent,
  beforeLoad: ({ params }) => {
    if (params.expenseId !== 'create') {
      throw redirect({ to: '/expenses/$expenseId/view', params });
    }
  },
});

function RouteComponent() {
  const form = useExpenseForm();

  useEffect(() => {
    form.setFieldValue('billedAt', new Date(), { dontUpdateMeta: true, dontRunListeners: true });
    setCurrentLocation(form);
  }, []);

  return <div>Hello "/_authenticated/expenses/$expenseId/pre"!</div>;
}

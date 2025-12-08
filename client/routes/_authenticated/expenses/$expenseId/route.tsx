import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { PageHeader } from '../../../../components/PageHeader';
import { queryClient, trpc, throwIfNotFound, handleFormMutateAsync } from '../../../../trpc';
import { useSuspenseQuery, useQuery, useMutation } from '@tanstack/react-query';
import { useAppForm } from '../../../../components/Form';
import { useEffect } from 'react';
import { createEditExpenseFormOptions, mapExpenseDetailToForm } from './-expense.common';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId')({
  component: RouteComponent,
  notFoundComponent: ExpenseNotFoundComponent,
  loader: ({ params }) => {
    const isCreate = params.expenseId === 'create';
    return Promise.all([
      isCreate
        ? undefined
        : queryClient
            .ensureQueryData(trpc.expense.loadDetail.queryOptions({ expenseId: params.expenseId }))
            .catch(error => throwIfNotFound(error)),
      queryClient.ensureQueryData(trpc.expense.loadOptions.queryOptions()),
      // load existing detail if not create
    ]);
  },
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const { expenseId } = Route.useParams();
  const isCreate = expenseId === 'create';
  const { data: optionsData } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const existingExpenseQuery = useQuery(
    trpc.expense.loadDetail.queryOptions(
      { expenseId },
      { enabled: !isCreate, refetchOnMount: false, refetchOnReconnect: false, refetchOnWindowFocus: false },
    ),
  );
  const createExpenseMutation = useMutation(trpc.expense.save.mutationOptions({ onSuccess: () => void form.reset() }));
  const form = useAppForm({
    ...createEditExpenseFormOptions,
    validators: {
      onSubmitAsync: async ({ value, signal }): Promise<any> => {
        signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.save.mutationKey() });
        const { billedAt, geolocation, ui, ...otherValues } = value;
        const formError = await handleFormMutateAsync(
          createExpenseMutation.mutateAsync({
            expenseId,
            ...otherValues,
            latitude: geolocation?.latitude ?? null,
            longitude: geolocation?.longitude ?? null,
            geoAccuracy: geolocation?.accuracy ?? null,
            billedAt: billedAt.toISOString(),
          }),
        );
        if (formError) return formError;
        queryClient.invalidateQueries(trpc.expense.list.queryFilter());
        queryClient.invalidateQueries(trpc.expense.loadDetail.queryFilter({ expenseId }));
        if ([value.account?.value, value.category?.value].includes('create')) {
          queryClient.invalidateQueries(trpc.expense.loadOptions.queryFilter());
        }
        navigate({ to: '/expenses', search: { month: billedAt.getMonth(), year: billedAt.getFullYear() } });
      },
    },
  });

  useEffect(() => {
    if (existingExpenseQuery.isSuccess && existingExpenseQuery.data) {
      form.reset(mapExpenseDetailToForm(existingExpenseQuery.data, optionsData), { keepDefaultValues: true });
      const { amountCents, items } = existingExpenseQuery.data;
      const totalCents = items.reduce((acc, { priceCents, quantity }) => acc + priceCents * quantity, 0);
      form.setFieldMeta('amountCents', meta => ({ ...meta, isDirty: totalCents !== amountCents }));
    }
  }, [existingExpenseQuery.isSuccess, existingExpenseQuery.isError]);

  useEffect(() => {
    if (isCreate && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const { latitude, longitude, accuracy } = coords;
          form.setFieldValue('geolocation', { latitude, longitude, accuracy });
        },
        () => {
          form.setFieldMeta('geolocation', meta => ({ ...meta, isTouched: true, isDirty: true }));
        },
      );
    }
  }, []);

  return (
    <div className='mx-auto max-w-md'>
      <div className='col-span-full'>
        <PageHeader title={(isCreate ? 'Create' : 'Edit') + ' expense'} showBackButton />
      </div>
      <div className='h-4'></div>
      <form.AppForm>
        <Outlet />
      </form.AppForm>
    </div>
  );
}

function ExpenseNotFoundComponent() {
  return (
    <div
      className='mx-auto max-w-md'
      onSubmit={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <PageHeader title='Expense not found' showBackButton />
      <p className='mt-8'>Unable to find selected expenses</p>
      <Link to='..' className='btn btn-primary btn-lg btn-block mt-8'>
        Back
      </Link>
    </div>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { queryClient, trpc } from '../../../trpc';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { FieldError } from '../../../components/FieldError';
import { DollarSign } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/expenses/create')({
  component: RouteComponent,
  loader: () => queryClient.ensureQueryData(trpc.expense.loadCreate.queryOptions()),
});

function RouteComponent() {
  const {
    data: { accountOptions, categoryOptions },
  } = useSuspenseQuery(trpc.expense.loadCreate.queryOptions());
  const form = useForm({
    defaultValues: {
      description: undefined as string | undefined,
      amountCents: 0.0,
      billedAt: new Date(),
      accountId: undefined as string | undefined,
      categoryId: undefined as string | undefined,
    },
    validators: {},
  });
  return (
    <form
      className='mx-auto max-w-md'
      onSubmit={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <h1 className='text-center text-3xl font-black'>Create expense</h1>
      <form.Field name='amountCents'>
        {field => (
          <>
            <label htmlFor={field.name} className='floating-label mt-8'>
              <label className='input input-primary input-xl w-full'>
                <DollarSign size='1em' />
                <input
                  autoFocus
                  type='number'
                  id={field.name}
                  name={field.name}
                  placeholder='Amount'
                  value={(field.state.value / 100).toFixed(2).padStart(5, '0')}
                  onChange={e =>
                    !isNaN(e.target.valueAsNumber) &&
                    field.handleChange(Math.floor(e.target.valueAsNumber * 1000) % 1000_000_000_00)
                  }
                  onKeyDown={e => {
                    if (e.key === 'Backspace') field.handleChange(v => v / 10);
                    else if (e.key === '.') field.handleChange(v => v * 100);
                    else return;
                    e.preventDefault();
                  }}
                />
              </label>
              <span>Amount</span>
            </label>
            <FieldError field={field} />
          </>
        )}
      </form.Field>
    </form>
  );
}

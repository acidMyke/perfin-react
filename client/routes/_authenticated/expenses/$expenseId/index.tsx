import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { trpc } from '../../../../trpc';
import { currencyNumberFormat, useExpenseForm } from './-expense.common';
import { calculateExpense } from '../../../../../server/lib/expenseHelper';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { FieldError } from '../../../../components/FieldError';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const form = useExpenseForm();
  const { data: optionsData } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const { accountOptions, categoryOptions } = optionsData;

  return (
    <>
      <form.Field name='billedAt'>
        {field => (
          <label htmlFor={field.name} className='floating-label mt-4'>
            <span>Date</span>
            <input
              type='datetime-local'
              id={field.name}
              name={field.name}
              placeholder='Date'
              className='input input-primary input-lg w-full'
              value={format(field.state.value, "yyyy-MM-dd'T'HH:mm")}
              onChange={e => {
                if (e.target.value === '') {
                  field.handleChange(new Date());
                } else {
                  const parsedDate = parse(e.target.value, "yyyy-MM-dd'T'HH:mm", new Date());
                  if (!isNaN(parsedDate.getTime())) {
                    field.handleChange(parsedDate);
                  }
                }
              }}
            />
            <FieldError field={field} />
          </label>
        )}
      </form.Field>
      <form.AppField name='category'>
        {({ ComboBox }) => <ComboBox label='Category' options={categoryOptions} containerCn='mt-4' />}
      </form.AppField>
      <form.AppField name='account'>
        {({ ComboBox }) => <ComboBox label='Account' options={accountOptions} containerCn='mt-8' />}
      </form.AppField>

      <form.Subscribe selector={state => [state.values]}>
        {([values]) => {
          const { itemCostSum, expectedRefundSum, amount } = calculateExpense(values);
          return (
            <div className='border-t-base-content/20 mt-6 grid grid-cols-2 border-t pt-4 text-xl *:odd:font-bold *:even:text-right'>
              <p>Gross amount:</p>
              <p>{currencyNumberFormat.format(itemCostSum)}</p>
              {expectedRefundSum > 0 && (
                <>
                  <p>Expected total:</p>
                  <p>{currencyNumberFormat.format(itemCostSum - expectedRefundSum)}</p>
                </>
              )}
              <p>Total paid:</p>
              <p>{currencyNumberFormat.format(amount)}</p>
            </div>
          );
        }}
      </form.Subscribe>
      <form.SubmitButton label='Submit' doneLabel='Submitted' inProgressLabel='Submitting...' />
    </>
  );
}

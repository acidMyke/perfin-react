import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { trpc } from '../../../../trpc';
import { currencyNumberFormat, useExpenseForm } from './-expense.common';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const form = useExpenseForm();
  const { expenseId } = Route.useParams();
  const isCreate = expenseId === 'create';
  const { data: optionsData } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());

  return (
    <>
      <form.AppField name='amountCents'>
        {({ NumericInput }) => (
          <NumericInput
            min={0}
            max={1000}
            label='Amount'
            containerCn='mt-4'
            inputCn='input-lg'
            transforms={['amountInCents']}
            numberFormat={currencyNumberFormat}
          />
        )}
      </form.AppField>
      <form.SubmitButton label='Submit' doneLabel='Submitted' inProgressLabel='Submitting...' />
    </>
  );
}

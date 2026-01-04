import { createFileRoute } from '@tanstack/react-router';
import { useExpenseForm } from './-expense.common';
import { coordinateFormat } from '../../../../utils';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/geolocation')({
  component: RouteComponent,
});

function RouteComponent() {
  const form = useExpenseForm();

  return (
    <div className='mb-20 grid grid-cols-2 gap-x-2'>
      <form.AppField name='geolocation.latitude'>
        {({ NumericInput }) => <NumericInput label='Latitude' containerCn='mt-2' numberFormat={coordinateFormat} />}
      </form.AppField>
      <form.AppField name='geolocation.longitude'>
        {({ NumericInput }) => <NumericInput label='Longitude' containerCn='mt-2' numberFormat={coordinateFormat} />}
      </form.AppField>
    </div>
  );
}

import { createFileRoute, Link } from '@tanstack/react-router';
import { calculateExpenseForm, useExpenseForm } from './-expense.common';
import { ItemDetailFieldGroup } from './-ExpenseItemFieldGroup';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/items/$indexStr')({
  component: RouteComponent,
});

function RouteComponent() {
  const { expenseId, indexStr } = Route.useParams();
  const form = useExpenseForm();

  const itemIndex = parseInt(indexStr);

  if (isNaN(itemIndex)) {
    throw new Error('index str not a number');
  }

  return (
    <>
      <form.Field name='items' mode='array'>
        {field => (
          <ItemDetailFieldGroup
            form={form}
            fields={`items[${itemIndex}]`}
            disableRemoveButton={field.state.value.length < 2}
            onRemoveClick={() => {
              if (field.state.value.length <= 3) {
                form.setFieldValue('ui.isItemsSubpage', false);
              }

              field.removeValue(itemIndex);
            }}
            itemIndex={itemIndex}
            additionalServiceChargePercent={form.getFieldValue('additionalServiceChargePercent')}
            isGstExcluded={form.getFieldValue('isGstExcluded')}
            onPricingChange={() => calculateExpenseForm(form)}
          />
        )}
      </form.Field>
      <Link to='/expenses/$expenseId' params={{ expenseId }}>
        <button className='btn btn-soft'>Back</button>
      </Link>
    </>
  );
}

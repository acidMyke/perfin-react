import { createFileRoute, Link } from '@tanstack/react-router';
import { calculateExpenseForm, useItemCallbacks, useAdjustmentCallbacks, useExpenseForm } from './-common';
import { ItemDetailFieldGroup } from './-common/ExpenseItemFieldGroup';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/items/$indexStr')({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const { expenseId, indexStr } = Route.useParams();
  const form = useExpenseForm();
  const { createItem, removeItem } = useItemCallbacks(form, expenseId, navigate);
  const { createAdjustment } = useAdjustmentCallbacks(form);

  const itemIndex = parseInt(indexStr);

  if (isNaN(itemIndex)) {
    throw new Error('index str not a number');
  }

  return (
    <>
      <form.Field name='items' mode='array' key={itemIndex}>
        {field => (
          <>
            <ItemDetailFieldGroup
              form={form}
              fields={`items[${itemIndex}]`}
              onRemoveClick={() => removeItem(itemIndex, field.state.value.length, true)}
              itemIndex={itemIndex}
              getFormField={form.getFieldValue.bind(form)}
              onPricingChange={() => calculateExpenseForm(form)}
              createAdjustment={expenseItemId => createAdjustment({ expenseItemId })}
            />

            <div className='mt-4 flex w-full'>
              {itemIndex !== 0 && (
                <Link
                  className='btn max-w-1/2 overflow-clip'
                  to='/expenses/$expenseId/items/$indexStr'
                  params={{ expenseId, indexStr: (itemIndex - 1).toString() }}
                  replace
                >
                  <ChevronLeft />
                  {field.state.value[itemIndex - 1]?.name
                    ? field.state.value[itemIndex - 1]?.name
                    : `Item ${itemIndex}`}
                </Link>
              )}

              <div className='grow'></div>

              {itemIndex < field.state.value.length - 1 ? (
                <Link
                  className='btn mr-auto'
                  disabled={itemIndex === field.state.value.length - 1}
                  to='/expenses/$expenseId/items/$indexStr'
                  params={{ expenseId, indexStr: (itemIndex + 1).toString() }}
                  replace
                >
                  {field.state.value[itemIndex + 1]?.name
                    ? field.state.value[itemIndex + 1]?.name
                    : `Item ${itemIndex + 2}`}
                  <ChevronRight />
                </Link>
              ) : (
                <button className='btn-soft btn-primary btn' onClick={() => createItem(field.state.value.length, true)}>
                  <Plus />
                  Add item
                </button>
              )}
            </div>
          </>
        )}
      </form.Field>
      <Link className='btn mt-4 w-full' to='/expenses/$expenseId' params={{ expenseId }} replace>
        Back to main
      </Link>
    </>
  );
}

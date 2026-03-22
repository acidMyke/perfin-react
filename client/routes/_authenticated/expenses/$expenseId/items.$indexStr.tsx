import { createFileRoute, Link } from '@tanstack/react-router';
import { calculateExpenseForm, createItemCallbacks, useAdjustmentCallbacks, useExpenseForm } from './-common';
import { ItemDetailFieldGroup } from './-common/ExpenseItemFieldGroup';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo } from 'react';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/items/$indexStr')({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const { expenseId, indexStr } = Route.useParams();
  const form = useExpenseForm();
  const { onAddClick, onRemoveClick } = useMemo(
    () => createItemCallbacks(form, expenseId, navigate),
    [form, expenseId, navigate],
  );
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
              onRemoveClick={() => onRemoveClick(itemIndex, field.state.value.length)}
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
                >
                  {field.state.value[itemIndex + 1]?.name
                    ? field.state.value[itemIndex + 1]?.name
                    : `Item ${itemIndex + 2}`}
                  <ChevronRight />
                </Link>
              ) : (
                <button className='btn-soft btn-primary btn' onClick={() => onAddClick(field.state.value.length)}>
                  <Plus />
                  Add item
                </button>
              )}
            </div>
          </>
        )}
      </form.Field>
      <Link to='/expenses/$expenseId' params={{ expenseId }} className='btn mt-4 w-full'>
        Back to main
      </Link>
    </>
  );
}

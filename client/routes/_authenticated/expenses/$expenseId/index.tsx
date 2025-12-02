import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { trpc } from '../../../../trpc';
import {
  calculateExpenseForm,
  createEditExpenseFormOptions,
  currencyNumberFormat,
  defaultExpenseItem,
  useExpenseForm,
} from './-expense.common';
import { calculateExpense } from '../../../../../server/lib/expenseHelper';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { FieldError } from '../../../../components/FieldError';
import { withForm } from '../../../../components/Form';
import { useStore } from '@tanstack/react-form';
import { Plus } from 'lucide-react';
import { ItemDetailFieldGroup } from './-ExpenseItemFieldGroup';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const form = useExpenseForm();
  const { data: optionsData } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const { accountOptions, categoryOptions } = optionsData;

  return (
    <>
      <ItemsDetailsSubForm form={form} />
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
        {({ ComboBox }) => <ComboBox label='Account' options={accountOptions} containerCn='mt-4' />}
      </form.AppField>
      <form.AppField name='ui.calculateResult'>
        {field => {
          const { grossAmount, expectedRefundSum, amount } = field.state.value;
          return (
            <div className='border-t-base-content/20 mt-6 grid grid-cols-2 border-t pt-4 text-xl *:odd:font-bold *:even:text-right'>
              <p>Gross amount:</p>
              <p>{currencyNumberFormat.format(grossAmount)}</p>
              {expectedRefundSum > 0 && (
                <>
                  <p>Expected total:</p>
                  <p>{currencyNumberFormat.format(grossAmount - expectedRefundSum)}</p>
                </>
              )}
              <p>Total paid:</p>
              <p>{currencyNumberFormat.format(amount)}</p>
            </div>
          );
        }}
      </form.AppField>
      <form.SubmitButton label='Submit' doneLabel='Submitted' inProgressLabel='Submitting...' />
    </>
  );
}

const ItemsDetailsSubForm = withForm({
  ...createEditExpenseFormOptions,
  render({ form }) {
    const isItemsSubpage = useStore(form.store, state => state.values.ui.isItemsSubpage);

    return (
      <form.Field name='items' mode='array'>
        {field => (
          <ul className='mt-4 flex max-h-96 flex-col gap-y-2 overflow-y-scroll py-2 pr-2 pl-4 *:even:pt-4'>
            {field.state.value.map((_, itemIndex) => {
              if (isItemsSubpage) {
                return <>Subpages {itemIndex}</>;
              }

              return (
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
              );
            })}
            <li key='Create'>
              <button
                className='btn-soft btn-primary btn w-2/3 justify-start'
                onClick={() => {
                  if (field.state.value.length >= 2) {
                    form.setFieldValue('ui.isItemsSubpage', true);
                  }
                  field.pushValue(defaultExpenseItem());
                }}
              >
                <Plus />
                Add item
              </button>
            </li>
          </ul>
        )}
      </form.Field>
    );
  },
});

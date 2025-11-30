import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { queryClient, trpc } from '../../../../trpc';
import {
  createEditExpenseFormOptions,
  currencyNumberFormat,
  defaultExpenseItem,
  defaultExpenseRefund,
  useExpenseForm,
} from './-expense.common';
import { calculateExpense } from '../../../../../server/lib/expenseHelper';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { FieldError } from '../../../../components/FieldError';
import { withForm } from '../../../../components/Form';
import { useStore } from '@tanstack/react-form';
import { Plus, X } from 'lucide-react';

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

const ItemsDetailsSubForm = withForm({
  ...createEditExpenseFormOptions,
  render({ form }) {
    const item0NameSuggestionMutation = useMutation(trpc.expense.getSuggestions.mutationOptions());
    const item1NameSuggestionMutation = useMutation(trpc.expense.getSuggestions.mutationOptions());
    const nameSuggestionMutations = [item0NameSuggestionMutation, item1NameSuggestionMutation];
    const isItemsSubpage = useStore(form.store, state => state.values.ui.isItemsSubpage);

    return (
      <form.Field name='items' mode='array'>
        {field => (
          <ul className='mt-4 flex max-h-96 flex-col gap-y-2 overflow-y-scroll py-2 pr-2 pl-4'>
            {field.state.value.map(({ id }, itemIndex) => {
              if (isItemsSubpage) {
                return <>Subpages {itemIndex}</>;
              }

              const itenNameSuggestionMutation = nameSuggestionMutations[itemIndex];
              return (
                <li key={id} className='grid grid-flow-row grid-cols-6 place-items-center gap-4 shadow-lg'>
                  <form.AppField
                    name={`items[${itemIndex}].name`}
                    validators={{
                      onChangeAsyncDebounceMs: 500,
                      onChangeAsync: ({ value, signal }) => {
                        signal.onabort = () =>
                          queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
                        if (value && value.length > 1) {
                          itenNameSuggestionMutation.mutateAsync({
                            type: 'itemName',
                            search: value,
                          });
                        }
                      },
                    }}
                  >
                    {field => (
                      <field.ComboBox
                        suggestionMode
                        placeholder=''
                        label={`Item ${itemIndex + 1} name`}
                        containerCn='col-span-4 w-full'
                        options={itenNameSuggestionMutation.data?.suggestions ?? []}
                      />
                    )}
                  </form.AppField>
                  <form.Field name={`items[${itemIndex}].expenseRefund`}>
                    {checkboxField => (
                      <label className='label col-span-2 mb-4 w-full'>
                        Refund:
                        <input
                          type='checkbox'
                          className='toggle'
                          checked={!!checkboxField.state.value}
                          onChange={e => {
                            if (e.target.checked && !checkboxField.state.value) {
                              form.setFieldValue(`items[${itemIndex}].expenseRefund`, defaultExpenseRefund());
                            } else if (!e.target.checked && checkboxField.state.value) {
                              form.setFieldValue(`items[${itemIndex}].expenseRefund`, null);
                            }
                          }}
                        />
                      </label>
                    )}
                  </form.Field>

                  <form.AppField name={`items[${itemIndex}].priceCents`}>
                    {({ NumericInput }) => (
                      <NumericInput
                        label='Price'
                        transforms={['amountInCents']}
                        numberFormat={currencyNumberFormat}
                        inputCn='input-lg'
                        containerCn='mt-2 col-span-3'
                      />
                    )}
                  </form.AppField>
                  <form.AppField name={`items[${itemIndex}].quantity`}>
                    {({ NumericInput }) => (
                      <NumericInput label='Quantity' inputCn='input-lg' containerCn='mt-2 col-span-2 w-full' />
                    )}
                  </form.AppField>
                  <button
                    className='btn-ghost btn btn-sm mb-1'
                    disabled={field.state.value.length === 1}
                    onClick={() => {
                      if (field.state.value.length <= 3) {
                        form.setFieldValue('ui.isItemsSubpage', false);
                      }

                      field.removeValue(itemIndex);
                    }}
                  >
                    <X />
                  </button>
                  <form.Field name={`items[${itemIndex}].expenseRefund`}>
                    {field =>
                      field.state.value && (
                        <>
                          <form.AppField
                            name={`items[${itemIndex}].expenseRefund.source`}
                            validators={{
                              onChangeAsyncDebounceMs: 500,
                              onChangeAsync: ({ value, signal }) => {
                                signal.onabort = () =>
                                  queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
                                if (value && value.length > 1) {
                                  itenNameSuggestionMutation.mutateAsync({
                                    type: 'itemName',
                                    search: value,
                                  });
                                }
                              },
                            }}
                          >
                            {field => (
                              <field.ComboBox
                                suggestionMode
                                placeholder='None'
                                label='Refund source'
                                containerCn='row-start-3 col-start-1 col-span-3 w-full'
                                options={itenNameSuggestionMutation.data?.suggestions ?? []}
                              />
                            )}
                          </form.AppField>
                          <form.AppField name={`items[${itemIndex}].expenseRefund.actualAmountCents`}>
                            {({ NumericInput }) => (
                              <NumericInput
                                label='Refunded amount'
                                transforms={['amountInCents']}
                                numberFormat={currencyNumberFormat}
                                inputCn='input-lg'
                                containerCn='mt-0 col-span-3'
                              />
                            )}
                          </form.AppField>
                        </>
                      )
                    }
                  </form.Field>
                </li>
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

import { useMutation } from '@tanstack/react-query';
import { withFieldGroup } from '../../../../components/Form';
import { queryClient, trpc } from '../../../../trpc';
import { currencyNumberFormat, defaultExpenseItem, defaultExpenseRefund } from './-expense.common';
import { X } from 'lucide-react';

export const ItemDetailFieldGroup = withFieldGroup({
  defaultValues: defaultExpenseItem(),
  props: {
    itemIndex: 0,
    disableRemoveButton: true,
    onRemoveClick: () => {},
  },
  render({ group, itemIndex, disableRemoveButton, onRemoveClick }) {
    const itenNameSuggestionMutation = useMutation(trpc.expense.getSuggestions.mutationOptions());

    return (
      <li className='grid grid-flow-row grid-cols-6 place-items-center gap-4 shadow-lg'>
        <group.AppField
          name={`name`}
          validators={{
            onChangeAsyncDebounceMs: 500,
            onChangeAsync: ({ value, signal }) => {
              signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
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
        </group.AppField>
        <group.Field name={`expenseRefund`}>
          {checkboxField => (
            <label className='label col-span-2 mb-4 w-full'>
              Refund:
              <input
                type='checkbox'
                className='toggle'
                checked={!!checkboxField.state.value}
                onChange={e => {
                  if (e.target.checked && !checkboxField.state.value) {
                    group.setFieldValue(`expenseRefund`, defaultExpenseRefund());
                  } else if (!e.target.checked && checkboxField.state.value) {
                    group.setFieldValue(`expenseRefund`, null);
                  }
                }}
              />
            </label>
          )}
        </group.Field>

        <group.AppField name={`priceCents`}>
          {({ NumericInput }) => (
            <NumericInput
              label='Price'
              transforms={['amountInCents']}
              numberFormat={currencyNumberFormat}
              inputCn='input-lg'
              containerCn='mt-2 col-span-3'
            />
          )}
        </group.AppField>
        <group.AppField name={`quantity`}>
          {({ NumericInput }) => (
            <NumericInput label='Quantity' inputCn='input-lg' containerCn='mt-2 col-span-2 w-full' />
          )}
        </group.AppField>
        <button className='btn-ghost btn btn-sm mb-1' disabled={disableRemoveButton} onClick={onRemoveClick}>
          <X />
        </button>
        <group.Field name={`expenseRefund`}>
          {field =>
            field.state.value && (
              <>
                <group.AppField
                  name={`expenseRefund.source`}
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
                </group.AppField>
                <group.AppField name={`expenseRefund.actualAmountCents`}>
                  {({ NumericInput }) => (
                    <NumericInput
                      label='Refunded amount'
                      transforms={['amountInCents']}
                      numberFormat={currencyNumberFormat}
                      inputCn='input-lg'
                      containerCn='mt-0 col-span-3'
                    />
                  )}
                </group.AppField>
              </>
            )
          }
        </group.Field>
      </li>
    );
  },
});

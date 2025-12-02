import { useMutation } from '@tanstack/react-query';
import { withFieldGroup } from '../../../../components/Form';
import { queryClient, trpc } from '../../../../trpc';
import { currencyNumberFormat, defaultExpenseItem, defaultExpenseRefund } from './-expense.common';
import { X } from 'lucide-react';
import { calculateExpenseItem } from '../../../../../server/lib/expenseHelper';

export const ItemDetailFieldGroup = withFieldGroup({
  defaultValues: defaultExpenseItem(),
  props: {
    itemIndex: 0,
    disableRemoveButton: true,
    onRemoveClick: () => {},
    additionalServiceChargePercent: null as number | null | undefined,
    isGstExcluded: null as boolean | null | undefined,
  },
  render({ group, itemIndex, disableRemoveButton, onRemoveClick, additionalServiceChargePercent, isGstExcluded }) {
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
                    group.setFieldValue(
                      `expenseRefund`,
                      defaultExpenseRefund({
                        item: {
                          priceCents: group.getFieldValue('priceCents'),
                          quantity: group.getFieldValue('quantity'),
                        },
                        additionalServiceChargePercent,
                        isGstExcluded,
                      }),
                    );
                  } else if (!e.target.checked && checkboxField.state.value) {
                    group.setFieldValue(`expenseRefund`, null);
                  }
                }}
              />
            </label>
          )}
        </group.Field>

        <group.AppField
          name={`priceCents`}
          listeners={{
            onChange: ({ value }) => {
              const hasRefund = group.getFieldValue('expenseRefund');
              if (!hasRefund) return;
              const quantity = group.getFieldValue('quantity');
              const { expectedAmountCents } = calculateExpenseItem(
                { item: { priceCents: value, quantity } },
                { additionalServiceChargePercent, isGstExcluded },
              );
              group.setFieldValue('expenseRefund.expectedAmountCents', expectedAmountCents);
            },
          }}
        >
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
        <group.AppField
          name={`quantity`}
          listeners={{
            onChange: ({ value }) => {
              const hasRefund = group.getFieldValue('expenseRefund');
              if (!hasRefund) return;
              const priceCents = group.getFieldValue('priceCents');
              const { expectedAmountCents } = calculateExpenseItem(
                { item: { priceCents, quantity: value } },
                { additionalServiceChargePercent, isGstExcluded },
              );
              group.setFieldValue('expenseRefund.expectedAmountCents', expectedAmountCents);
            },
          }}
        >
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
                <group.Subscribe selector={state => [state.values.expenseRefund?.expectedAmountCents]}>
                  {([expectedAmountCents]) => (
                    <group.AppField name={`expenseRefund.actualAmountCents`}>
                      {({ NumericInput }) => (
                        <NumericInput
                          label='Refunded amount'
                          transforms={['amountInCents']}
                          numberFormat={currencyNumberFormat}
                          inputCn='input-lg'
                          containerCn='mt-0 col-span-3'
                          additionalSuffix={
                            expectedAmountCents !== undefined
                              ? `/ ${currencyNumberFormat.format(expectedAmountCents / 100)}`
                              : undefined
                          }
                        />
                      )}
                    </group.AppField>
                  )}
                </group.Subscribe>
              </>
            )
          }
        </group.Field>
      </li>
    );
  },
});

import { useMutation } from '@tanstack/react-query';
import { withFieldGroup } from '../../../../components/Form';
import { queryClient, trpc } from '../../../../trpc';
import { defaultExpenseItem, defaultExpenseRefund, type ExpenseFormData } from './-expense.common';
import { X } from 'lucide-react';
import type { DeepKeys, DeepValue } from '@tanstack/react-form';
import { currencyNumberFormat } from '../../../../utils';

type TGetFormField = <TField extends DeepKeys<ExpenseFormData>>(field: TField) => DeepValue<ExpenseFormData, TField>;

export const ItemDetailFieldGroup = withFieldGroup({
  defaultValues: defaultExpenseItem(),
  props: {
    itemIndex: 0,
    disableRemoveButton: true,
    onRemoveClick: () => {},
    getFormField: (() => {}) as unknown as TGetFormField,
    onPricingChange: () => {},
  },
  render({ group, itemIndex, disableRemoveButton, onRemoveClick, getFormField, onPricingChange }) {
    const itenNameSuggestionMutation = useMutation(trpc.expense.getSuggestions.mutationOptions());
    const refundSourceSuggestionMutation = useMutation(trpc.expense.getSuggestions.mutationOptions());
    const inferItemPriceMutation = useMutation(trpc.expense.inferItemPrice.mutationOptions());

    return (
      <li className='grid grid-flow-row grid-cols-8 place-items-center gap-x-2 shadow-lg'>
        <group.AppField
          name={`name`}
          validators={{
            onChangeAsyncDebounceMs: 500,
            onChangeAsync: ({ value, signal, fieldApi }) => {
              if (fieldApi.form.state.isSubmitting) return;
              signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
              if (value && value.length > 1) {
                itenNameSuggestionMutation.mutateAsync({
                  type: 'itemName',
                  search: value,
                  shopName: getFormField('shopName'),
                });
              }
            },
            onBlurAsync: async ({ value }) => {
              const shopName = getFormField('shopName');
              if (!value.trim() || !shopName?.trim()) return;
              const [itemDetail] = await inferItemPriceMutation.mutateAsync({ itemName: value, shopName });
              if (itemDetail) {
                group.setFieldValue('priceCents', itemDetail.priceCents);
              }
            },
          }}
        >
          {field => (
            <field.HeadlessComboBox
              suggestionMode
              label={`Item ${itemIndex + 1} name`}
              containerCn='col-span-7 w-full'
              options={itenNameSuggestionMutation.data?.suggestions ?? []}
            />
          )}
        </group.AppField>
        <button className='btn-ghost btn btn-sm mb-1' disabled={disableRemoveButton} onClick={onRemoveClick}>
          <X />
        </button>

        <group.AppField name={`priceCents`} listeners={{ onChange: () => onPricingChange() }}>
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
        <group.AppField name={`quantity`} listeners={{ onChange: () => onPricingChange() }}>
          {({ NumericInput }) => (
            <NumericInput label='Quantity' inputCn='input-lg' containerCn='mt-2 col-span-2 w-full' step={1} min={1} />
          )}
        </group.AppField>

        <group.Field name={`expenseRefund`}>
          {field => (
            <>
              <label className='label col-span-3 mb-4 w-full pl-4'>
                Refund:
                <input
                  type='checkbox'
                  className='toggle'
                  checked={!!field.state.value}
                  onChange={e => {
                    if (e.target.checked && !field.state.value) {
                      group.setFieldValue(
                        `expenseRefund`,
                        defaultExpenseRefund({
                          item: {
                            priceCents: group.getFieldValue('priceCents'),
                            quantity: group.getFieldValue('quantity'),
                          },
                          additionalServiceChargePercent: getFormField('additionalServiceChargePercent'),
                          isGstExcluded: getFormField('isGstExcluded'),
                        }),
                      );
                    } else if (!e.target.checked && field.state.value) {
                      group.setFieldValue(`expenseRefund`, null);
                      onPricingChange();
                    }
                  }}
                />
              </label>
              {field.state.value && (
                <>
                  <group.AppField
                    name={`expenseRefund.source`}
                    validators={{
                      onChangeAsyncDebounceMs: 500,
                      onChangeAsync: ({ value, signal, fieldApi }) => {
                        if (fieldApi.form.state.isSubmitting) return;

                        signal.onabort = () =>
                          queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
                        if (value && value.length > 1) {
                          refundSourceSuggestionMutation.mutateAsync({
                            type: 'refundSource',
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
                        containerCn='row-start-3 col-start-1 col-span-4 w-full'
                        options={refundSourceSuggestionMutation.data?.suggestions ?? []}
                      />
                    )}
                  </group.AppField>
                  <group.Subscribe selector={state => [state.values.expenseRefund?.expectedAmountCents]}>
                    {([expectedAmountCents]) => (
                      <group.AppField
                        name={`expenseRefund.actualAmountCents`}
                        listeners={{ onChange: () => onPricingChange() }}
                      >
                        {({ NumericInput }) => (
                          <NumericInput
                            label='Refunded amount'
                            transforms={['amountInCents']}
                            numberFormat={currencyNumberFormat}
                            inputCn='input-lg'
                            containerCn='mt-0 col-span-4'
                            additionalSuffix={
                              expectedAmountCents !== undefined
                                ? `/${currencyNumberFormat.format(expectedAmountCents / 100)}`
                                : undefined
                            }
                          />
                        )}
                      </group.AppField>
                    )}
                  </group.Subscribe>
                </>
              )}
            </>
          )}
        </group.Field>
      </li>
    );
  },
});

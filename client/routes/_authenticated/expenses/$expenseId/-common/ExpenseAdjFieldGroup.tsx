import { withFieldGroup } from '#components/Form';
import { useMutation } from '@tanstack/react-query';
import { defaultExpenseAdjustment, type TGetExpenseFormField } from '.';
import { queryClient, trpc } from '#client/trpc';
import { GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';
import { X } from 'lucide-react';
import { currencyNumberFormat, percentageNumberFormat } from '#client/utils';

export const AdjustmentDetailFieldGroup = withFieldGroup({
  defaultValues: defaultExpenseAdjustment(),
  props: {
    adjIndex: 0,
    onRemoveClick: () => {},
    getFormField: (() => {}) as unknown as TGetExpenseFormField,
    onPricingChange: () => {},
  },
  render({ group, adjIndex, onRemoveClick, getFormField, onPricingChange }) {
    const adjustmentNameSuggestionMutation = useMutation(trpc.expense.getSuggestions.mutationOptions());

    return (
      <group.AppField
        name={`name`}
        validators={{
          onChangeAsyncDebounceMs: 500,
          onChangeAsync: ({ value, signal, fieldApi }) => {
            if (fieldApi.form.state.isSubmitting) return;
            signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
            adjustmentNameSuggestionMutation.mutate({
              type: 'adjName',
              search: value ?? '',
              context: getFormField('shopName') ?? undefined,
            });
          },
        }}
      >
        {nameField => {
          const adjName = nameField.state.value;
          const isGst = adjName === GST_NAME;
          const isServiceCharge = adjName === SERVICE_CHARGE_NAME;

          return (
            <li className='flex flex-row items-center gap-2'>
              <p className=''>{adjIndex + 1}.</p>
              {isGst ? (
                <p className='w-48'>GST</p>
              ) : isServiceCharge ? (
                <p className='w-48'>Service charge</p>
              ) : (
                <nameField.ComboBox
                  suggestionMode
                  containerCn='w-48'
                  options={adjustmentNameSuggestionMutation.data?.suggestions ?? []}
                  triggerChangeOnFocus
                  inputCn='input-sm text-sm'
                  hideError
                />
              )}

              <group.AppField name='rateBps' listeners={{ onChange: () => onPricingChange() }}>
                {rateBpsField =>
                  rateBpsField.state.value == null ? (
                    <group.AppField name='amountCents' listeners={{ onChange: () => onPricingChange() }}>
                      {({ NumericInput }) => (
                        <NumericInput
                          transforms={['amountInCents']}
                          numberFormat={currencyNumberFormat}
                          containerCn='mt-0 w-24'
                          inputCn='input-sm text-sm'
                          hideError
                        />
                      )}
                    </group.AppField>
                  ) : !isGst ? (
                    <rateBpsField.NumericInput
                      transforms={['percentage']}
                      numberFormat={percentageNumberFormat}
                      containerCn='mt-0 w-24'
                      inputCn='input-sm text-sm'
                      readOnly={isGst}
                      hideError
                    />
                  ) : (
                    <p className='mb-1 w-24 text-right'>
                      {percentageNumberFormat.format(rateBpsField.state.value / 10000)}
                    </p>
                  )
                }
              </group.AppField>

              <button className='btn-ghost btn btn-sm mb-1' onClick={onRemoveClick}>
                <X />
              </button>
            </li>
          );
        }}
      </group.AppField>
    );
  },
});

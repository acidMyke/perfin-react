import { withFieldGroup } from '#components/Form';
import { useMutation } from '@tanstack/react-query';
import { defaultExpenseAdjustment, useExpenseForm, type TGetExpenseFormField } from '.';
import { queryClient, trpc } from '#client/trpc';
import { GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';
import { X } from 'lucide-react';
import { currencyNumberFormat, formatBps, formatCents, percentageNumberFormat } from '#client/utils';

const AdjustmnetResult = ({ adjIndex, type }: { adjIndex: number; type: 'amountCents' | 'rateBps' }) => {
  const form = useExpenseForm();
  return (
    <form.Subscribe
      selector={state => [state.values.ui.calculateResult.adjustmentCents[adjIndex][type === 'amountCents' ? 1 : 2]]}
    >
      {([value]) => {
        return type === 'amountCents' ? formatCents(value) : formatBps(isNaN(value) ? 0 : value);
      }}
    </form.Subscribe>
  );
};

export const AdjustmentDetailFieldGroup = withFieldGroup({
  defaultValues: defaultExpenseAdjustment(),
  props: {
    adjIndex: 0,
    onRemoveClick: () => {},
    getFormField: (() => {}) as unknown as TGetExpenseFormField,
    onPricingChange: () => {},
    toggleAdjustmentType: () => {},
  },
  render({ group, adjIndex, onRemoveClick, getFormField, onPricingChange, toggleAdjustmentType }) {
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
              {isGst ? (
                <p className='w-48 grow'>GST</p>
              ) : isServiceCharge ? (
                <p className='w-48 grow'>Service charge</p>
              ) : (
                <nameField.ComboBox
                  suggestionMode
                  containerCn='w-48 grow'
                  options={adjustmentNameSuggestionMutation.data?.suggestions ?? []}
                  triggerChangeOnFocus
                  inputCn='input-sm text-sm'
                  hideError
                />
              )}

              <group.AppField name='rateBps' listeners={{ onChange: () => onPricingChange() }}>
                {rateBpsField =>
                  rateBpsField.state.value == null ? (
                    <>
                      <group.AppField name='amountCents' listeners={{ onChange: () => onPricingChange() }}>
                        {({ NumericInput }) => (
                          <NumericInput
                            transforms={['amountInCents']}
                            numberFormat={currencyNumberFormat}
                            containerCn='mt-0 w-28'
                            inputCn='input-sm text-sm'
                            hideError
                          />
                        )}
                      </group.AppField>
                      <button className='btn btn-ghost w-16 justify-end pr-3' onClick={toggleAdjustmentType}>
                        <AdjustmnetResult adjIndex={adjIndex} type='rateBps' />
                      </button>
                    </>
                  ) : (
                    <>
                      {isGst || isServiceCharge ? (
                        <p className='w-16 text-center'>
                          <AdjustmnetResult adjIndex={adjIndex} type='amountCents' />
                        </p>
                      ) : (
                        <button className='btn btn-ghost w-16' onClick={toggleAdjustmentType}>
                          <AdjustmnetResult adjIndex={adjIndex} type='amountCents' />
                        </button>
                      )}
                      {isGst ? (
                        <p className='w-28 pr-3 text-right text-sm'>{formatBps(rateBpsField.state.value!)}</p>
                      ) : (
                        <rateBpsField.NumericInput
                          transforms={['percentage']}
                          numberFormat={percentageNumberFormat}
                          containerCn='mt-0 w-28'
                          inputCn='input-sm text-sm'
                          innerInputCn='text-right appearance-none'
                          hideError
                        />
                      )}
                    </>
                  )
                }
              </group.AppField>

              <button className='btn-ghost btn btn-sm px-0' onClick={onRemoveClick}>
                <X />
              </button>
            </li>
          );
        }}
      </group.AppField>
    );
  },
});

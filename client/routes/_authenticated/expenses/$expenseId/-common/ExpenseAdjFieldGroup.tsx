import { withFieldGroup } from '#components/Form';
import { useMutation } from '@tanstack/react-query';
import { defaultExpenseAdjustment, useExpenseForm, type TGetExpenseFormField } from '.';
import { queryClient, trpc } from '#client/trpc';
import { GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';
import { Unlink, X } from 'lucide-react';
import { currencyNumberFormat, formatBps, formatCents, percentageNumberFormat } from '#client/utils';
import { useStore } from '@tanstack/react-form';

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
    const [isGst, isServiceCharge, isRateAdjustment, isItemBounded] = useStore(group.store, state => [
      state.values.name === GST_NAME,
      state.values.name === SERVICE_CHARGE_NAME,
      state.values.rateBps == null,
      !!state.values.expenseItemId,
    ]);
    console.log('render');

    return (
      <li className='flex flex-row items-center gap-2'>
        {/* Name field */}
        {isGst || isServiceCharge ? (
          <p className='w-48 grow pl-3'> {isGst ? 'GST' : 'Service charge'}</p>
        ) : (
          <group.AppField
            name={`name`}
            validators={{
              onChangeAsyncDebounceMs: 500,
              onChangeAsync: ({ value, signal, fieldApi }) => {
                if (fieldApi.form.state.isSubmitting) return;
                signal.onabort = () =>
                  queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
                adjustmentNameSuggestionMutation.mutate({
                  type: 'adjName',
                  search: value ?? '',
                  context: getFormField('shopName') ?? undefined,
                });
              },
            }}
          >
            {({ ComboBox }) => (
              <ComboBox
                suggestionMode
                containerCn='w-48 grow'
                options={adjustmentNameSuggestionMutation.data?.suggestions ?? []}
                triggerChangeOnFocus
                inputCn='input-sm text-sm'
                hideError
              />
            )}
          </group.AppField>
        )}
        {/* Amount & Rate fields */}
        {isRateAdjustment ? (
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
            <group.AppField name='rateBps' listeners={{ onChange: () => onPricingChange() }}>
              {({ NumericInput, state: { value } }) =>
                isGst ? (
                  <p className='w-28 pr-3 text-right text-sm'>{formatBps(value!)}</p>
                ) : (
                  <NumericInput
                    transforms={['percentage']}
                    numberFormat={percentageNumberFormat}
                    containerCn='mt-0 w-28'
                    inputCn='input-sm text-sm'
                    innerInputCn='text-right appearance-none'
                    hideError
                  />
                )
              }
            </group.AppField>
          </>
        )}

        {isItemBounded ? (
          <button
            className='btn-ghost btn btn-sm px-0'
            onClick={() => {
              group.setFieldValue('expenseItemId', undefined);
              onPricingChange();
            }}
          >
            <Unlink />
          </button>
        ) : (
          <button className='btn-ghost btn btn-sm px-0' onClick={onRemoveClick}>
            <X />
          </button>
        )}
      </li>
    );
  },
});

import { withFieldGroup } from '#components/Form';
import { defaultExpenseAdjustment, useExpenseForm, type TGetExpenseFormField } from '.';
import { GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';
import { ChevronDown, ChevronUp, Unlink, X } from 'lucide-react';
import { currencyNumberFormat, formatBps, formatCents, percentageNumberFormat } from '#client/utils';
import { useStore } from '@tanstack/react-form';
import { ExpenseSuggestableField } from './ExpenseSuggestableField';

const AdjustmnetResult = ({ adjIndex, type }: { adjIndex: number; type: 'amountCents' | 'rateBps' }) => {
  const form = useExpenseForm();
  return (
    <form.Subscribe selector={state => [state.values.ui.calculateResult.adjustmentResults[adjIndex][1][type]]}>
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
    onRemoveClick: (_: number) => {},
    getFormField: (() => {}) as unknown as TGetExpenseFormField,
    onPricingChange: () => {},
    toggleAdjustmentType: (_: number, _itemId?: string | null) => {},
    onSwapClick: (_: number) => {},
  },
  render({ group, adjIndex, onRemoveClick, getFormField, onPricingChange, toggleAdjustmentType, onSwapClick }) {
    const [isGst, isServiceCharge, isRateAdjustment, expenseItemId] = useStore(group.store, state => [
      state.values?.name === GST_NAME,
      state.values?.name === SERVICE_CHARGE_NAME,
      state.values?.rateBps == null,
      state.values?.expenseItemId,
    ]);
    const isItemBounded = !!expenseItemId;

    return (
      <li className='flex flex-row items-center gap-2'>
        {/* Name field */}
        {isGst || isServiceCharge ? (
          <p className='w-40 grow pl-3'> {isGst ? 'GST' : 'Service charge'}</p>
        ) : (
          <ExpenseSuggestableField
            form={group}
            fields={{ text: 'name' }}
            scope='adjName'
            getContext={() => getFormField('shopName')}
            containerCn='w-40 grow'
            inputCn='input-sm text-sm'
            triggerChangeOnFocus
            hideError
          />
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
            <button
              className='btn btn-ghost w-16 justify-end pr-3'
              onClick={() => toggleAdjustmentType(adjIndex, expenseItemId)}
            >
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
              <button className='btn btn-ghost w-16' onClick={() => toggleAdjustmentType(adjIndex, expenseItemId)}>
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
              group.setFieldValue('expenseItemId', null);
              onPricingChange();
            }}
          >
            <Unlink />
          </button>
        ) : (
          <button className='btn-ghost btn btn-sm px-0' onClick={() => onRemoveClick(adjIndex)}>
            <X />
          </button>
        )}

        <button className='btn-ghost btn btn-sm px-0' onClick={() => onSwapClick(adjIndex)}>
          {adjIndex === 0 ? <ChevronDown /> : <ChevronUp />}
        </button>
      </li>
    );
  },
});

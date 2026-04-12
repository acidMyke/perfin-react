import { withFieldGroup } from '#components/Form';
import { defaultExpenseItem, useExpenseForm, type TGetExpenseFormField } from '.';
import { X } from 'lucide-react';
import { currencyNumberFormat, formatCents } from '#client/utils';
import { useStore } from '@tanstack/react-form';
import { ExpenseSuggestableField } from './ExpenseSuggestableField';
import { useMutation } from '@tanstack/react-query';
import { trpc } from '#client/trpc';
import { useState } from 'react';

const ItemResult = ({ itemId }: { itemId: string }) => {
  const form = useExpenseForm();
  return (
    <form.Subscribe selector={state => [state.values.ui.calculateResult.itemResults[itemId]]}>
      {([itemResult]) => {
        const { grossTotalCents = 0, netTotalCents = 0 } = itemResult ?? {};
        const [showNet, setShowNet] = useState(true);
        return (
          <button className='btn btn-ghost col-span-2' onClick={() => setShowNet(v => !v)}>
            {showNet ? 'N: ' : 'G: '}
            {formatCents(showNet ? netTotalCents : grossTotalCents)}
          </button>
        );
      }}
    </form.Subscribe>
  );
};

export const ItemDetailFieldGroup = withFieldGroup({
  defaultValues: defaultExpenseItem(),
  props: {
    itemIndex: 0,
    onRemoveClick: () => {},
    getFormField: (() => {}) as unknown as TGetExpenseFormField,
    onPricingChange: () => {},
    createAdjustment: (_: string) => {},
  },
  render({ group, itemIndex, onRemoveClick, getFormField, onPricingChange, createAdjustment }) {
    const itemId = useStore(group.store, state => state.values.id);
    const inferItemPriceMutation = useMutation(trpc.expense.inferItemPrice.mutationOptions());

    return (
      <li className='grid grid-flow-row grid-cols-8 place-items-center gap-x-2 gap-y-1 shadow-lg'>
        <ExpenseSuggestableField
          form={group}
          fields={{ text: 'name' }}
          scope='itemName'
          getContext={() => getFormField('shopName')}
          label={`Item ${itemIndex + 1} name`}
          containerCn='col-span-7 w-full'
          triggerChangeOnFocus
          hideError
          onSuggestionSelected={suggestion => {
            const isPriceCentsDirty = group.getFieldMeta('priceCents')?.isDirty;
            if (!isPriceCentsDirty) {
              const shopName = getFormField('shopName');
              if (!suggestion?.trim() || !shopName?.trim()) return;
              inferItemPriceMutation.mutateAsync({ itemName: suggestion, shopName }).then(([itemDetail]) => {
                if (itemDetail) {
                  group.setFieldValue('priceCents', itemDetail.priceCents, { dontUpdateMeta: true });
                }
              });
            }
          }}
        />

        <button className='btn-ghost btn btn-sm' onClick={onRemoveClick}>
          <X />
        </button>

        <group.AppField name={`priceCents`} listeners={{ onChange: () => onPricingChange() }}>
          {({ NumericInput }) => (
            <NumericInput
              label='Price'
              transforms={['amountInCents']}
              numberFormat={currencyNumberFormat}
              containerCn='mt-2 col-span-3'
              hideError
            />
          )}
        </group.AppField>
        <group.AppField name={`quantity`} listeners={{ onChange: () => onPricingChange() }}>
          {({ NumericInput }) => (
            <NumericInput label='Quantity' containerCn='mt-2 col-span-2 w-full' step={1} min={1} hideError />
          )}
        </group.AppField>

        <ItemResult itemId={itemId} />
        <button type='button' className='btn btn-ghost btn-square text-md' onClick={() => createAdjustment(itemId)}>
          Adj.
        </button>
      </li>
    );
  },
});

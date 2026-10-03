import { withFieldGroup, type Option } from '#components/Form';
import { defaultExpenseItem, useExpenseForm, usePushIntoOptions } from '.';
import { X } from 'lucide-react';
import { currencyNumberFormat, formatCents } from '#client/utils';
import { useSelector } from '@tanstack/react-form';
import { ExpenseSuggestableField } from './ExpenseSuggestableField';
import { skipToken, useQuery } from '@tanstack/react-query';
import { trpc, type RouterInputs } from '#client/trpc';
import { useEffect, useState } from 'react';

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

type GetItemDetailInput = RouterInputs['expense']['getItemDetail'];

export const ItemDetailFieldGroup = withFieldGroup({
  defaultValues: defaultExpenseItem(),
  props: {
    itemIndex: 0,
    shopName: '' as string | null,
    mallName: '' as string | null,
    categoryOptions: [] as Option[],
    onRemoveClick: () => {},
    onPricingChange: () => {},
    createAdjustment: (_: string) => {},
  },
  render({ group, itemIndex, shopName, mallName, categoryOptions, onRemoveClick, onPricingChange, createAdjustment }) {
    const { pushIntoOptions } = usePushIntoOptions();
    const itemId = useSelector(group.store, state => state.values.id);
    const [itemDetailInput, setItemDetailInput] = useState<GetItemDetailInput>();
    const getItemDetailQuery = useQuery(trpc.expense.getItemDetail.queryOptions(itemDetailInput ?? skipToken));

    useEffect(() => {
      if (!getItemDetailQuery.data || !getItemDetailQuery.data[0]) return;
      const [itemDetail] = getItemDetailQuery.data;
      group.setFieldValue('priceCents', itemDetail.priceCents, { dontUpdateMeta: true });
      if (itemDetail.categoryId) {
        const category = categoryOptions.find(({ value }) => value == itemDetail.categoryId);
        if (category) {
          group.setFieldValue('category', category, { dontUpdateMeta: true });
        }
      }
    }, [group, getItemDetailQuery.data]);

    return (
      <li className='grid grid-flow-row grid-cols-8 place-items-center gap-x-2 gap-y-1 shadow-lg'>
        <ExpenseSuggestableField
          form={group}
          fields={{ text: 'name' }}
          kind='itemName'
          context={shopName ? { kind: 'shopName', text: shopName } : undefined}

          label={`Item ${itemIndex + 1} name`}
          containerCn='col-span-4 w-full'
          triggerChangeOnFocus
          hideError
          onSuggestionSelected={itemName => {
            const isPriceCentsDirty = group.getFieldMeta('priceCents')?.isDirty;
            if (!isPriceCentsDirty) {
              if (!itemName?.trim()) return;
              setItemDetailInput({ itemName, shopName, mallName });
            }
          }}
        />

        <group.AppField
          name={`category`}
          listeners={{
            onChange: fieldApi => {
              if (fieldApi.value && fieldApi.value.value == null) {
                pushIntoOptions({ kind: 'category', option: fieldApi.value });
              }
              onPricingChange();
            },
          }}
        >
          {({ ComboBox }) => <ComboBox label='Category' options={categoryOptions} containerCn='col-span-3' />}
        </group.AppField>

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

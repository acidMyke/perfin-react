import { useMutation } from '@tanstack/react-query';
import { withFieldGroup } from '#components/Form';
import { queryClient, trpc } from '#client/trpc';
import { defaultExpenseItem, useExpenseForm, type TGetExpenseFormField } from '.';
import { X } from 'lucide-react';
import { currencyNumberFormat, formatCents } from '#client/utils';
import { useStore } from '@tanstack/react-form';

const ItemResult = ({ itemId }: { itemId: string }) => {
  const form = useExpenseForm();
  return (
    <form.Subscribe selector={state => [state.values.ui.calculateResult.itemResults.get(itemId)]}>
      {([itemResult]) => <p className='col-span-2 text-lg'>{formatCents(itemResult?.grossTotalCents ?? 0)}</p>}
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
    const itenNameSuggestionMutation = useMutation(trpc.expense.getSuggestions.mutationOptions());
    const inferItemPriceMutation = useMutation(trpc.expense.inferItemPrice.mutationOptions());

    return (
      <li className='grid grid-flow-row grid-cols-8 place-items-center gap-x-2 gap-y-1 shadow-lg'>
        <group.AppField
          name={`name`}
          validators={{
            onChangeAsyncDebounceMs: 500,
            onChangeAsync: ({ value, signal, fieldApi }) => {
              if (fieldApi.form.state.isSubmitting) return;
              signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
              itenNameSuggestionMutation.mutate({
                type: 'itemName',
                search: value ?? '',
                context: getFormField('shopName') ?? undefined,
              });
            },
            onBlurAsync: async ({ value, fieldApi }) => {
              if (fieldApi.form.state.isSubmitting) return;
              const isPriceCentsDirty = group.getFieldMeta('priceCents')?.isDirty;
              if (!isPriceCentsDirty) {
                const shopName = getFormField('shopName');
                if (!value?.trim() || !shopName?.trim()) return;
                const [itemDetail] = await inferItemPriceMutation.mutateAsync({ itemName: value, shopName });
                if (itemDetail) {
                  group.setFieldValue('priceCents', itemDetail.priceCents, { dontUpdateMeta: true });
                }
              }
            },
          }}
        >
          {field => (
            <field.ComboBox
              suggestionMode
              label={`Item ${itemIndex + 1} name`}
              containerCn='col-span-7 w-full'
              options={itenNameSuggestionMutation.data?.suggestions ?? []}
              triggerChangeOnFocus
              hideError
            />
          )}
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

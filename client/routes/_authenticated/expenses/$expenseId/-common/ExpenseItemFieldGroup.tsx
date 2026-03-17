import { useMutation } from '@tanstack/react-query';
import { withFieldGroup } from '#components/Form';
import { queryClient, trpc } from '#client/trpc';
import { defaultExpenseItem, type ExpenseFormData } from '.';
import { X } from 'lucide-react';
import type { DeepKeys, DeepValue } from '@tanstack/react-form';
import { currencyNumberFormat } from '#client/utils';

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
              containerCn='mt-2 col-span-3'
            />
          )}
        </group.AppField>
        <group.AppField name={`quantity`} listeners={{ onChange: () => onPricingChange() }}>
          {({ NumericInput }) => (
            <NumericInput label='Quantity' containerCn='mt-2 col-span-2 w-full' step={1} min={1} />
          )}
        </group.AppField>
      </li>
    );
  },
});

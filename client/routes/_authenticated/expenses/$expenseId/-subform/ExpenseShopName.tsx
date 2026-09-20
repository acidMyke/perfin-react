import { withForm } from '#client/components/Form';
import type { Coordinate } from '#client/utils';
import { useSelector } from '@tanstack/react-form';
import { createEditExpenseFormOptions } from '../-common';
import { ExpenseSuggestableField, type SuggestionFieldProps } from '../-common/ExpenseSuggestableField';

type ShopNameSubFormProps = {
  coordinate?: Coordinate;
  onShopNameSelect: (_shopName: string) => any;
} & Partial<Pick<SuggestionFieldProps, Extract<keyof SuggestionFieldProps, `${string}Cn`> | 'label' | 'hideError'>>;

export const ShopNameSubForm = withForm({
  ...createEditExpenseFormOptions,
  props: { onShopNameSelect: (_shopName: string) => {} } as ShopNameSubFormProps,
  render({ form, coordinate: coordinateProp, onShopNameSelect, ...cnProps }) {
    const [shopMall, geolocation] = useSelector(
      form.store,
      state => [state.values.shopMall, state.values.geolocation] as const,
    );

    const latitude = coordinateProp?.latitude ?? geolocation.latitude;
    const longitude = coordinateProp?.longitude ?? geolocation.longitude;

    return (
      <ExpenseSuggestableField
        form={form}
        fields={{ text: 'shopName' }}
        kind='shopName'
        context={shopMall ? { kind: 'mallName', text: shopMall } : undefined}
        coordinate={latitude && longitude ? { latitude, longitude } : undefined}
        label='Shop name'
        triggerChangeOnFocus
        hideError
        onSuggestionSelected={onShopNameSelect}
        {...cnProps}
      />
    );
  },
});

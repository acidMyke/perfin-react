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
  render({ form, coordinate, onShopNameSelect, ...cnProps }) {
    const [shopMall, geolocation, isOnline] = useSelector(form.store, state => [
      state.values.shopMall,
      state.values.geolocation,
      state.values.type === 'online',
    ]);

    const latitude = coordinate?.latitude ?? geolocation.latitude;
    const longitude = coordinate?.longitude ?? geolocation.longitude;

    const location = isOnline
      ? { isOnline: true as const }
      : latitude && longitude
        ? { latitude, longitude }
        : undefined;

    return (
      <ExpenseSuggestableField
        form={form}
        fields={{ text: 'shopName' }}
        kind='shopName'
        context={shopMall ? { kind: 'mallName', text: shopMall } : undefined}
        location={location}
        label='Shop name'
        triggerChangeOnFocus
        hideError
        onSuggestionSelected={onShopNameSelect}
        {...cnProps}
      />
    );
  },
});

import { withForm } from '#client/components/Form';
import type { Coordinate } from '#client/utils';
import { useSelector } from '@tanstack/react-form';
import { createEditExpenseFormOptions } from '../-common';
import { ExpenseSuggestableField, type SuggestionFieldProps } from '../-common/ExpenseSuggestableField';

type MallNameSubFormProps = { coordinate?: Coordinate } & Partial<
  Pick<SuggestionFieldProps, Extract<keyof SuggestionFieldProps, `${string}Cn`> | 'label' | 'hideError'>
>;

export const MallNameSubForm = withForm({
  ...createEditExpenseFormOptions,
  props: {} as MallNameSubFormProps,
  render({ form, coordinate, ...cnProps }) {
    const [shopName, geolocation, isOnline] = useSelector(form.store, state => [
      state.values.shopName,
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
        fields={{ text: 'shopMall' }}
        kind='mallName'
        context={shopName ? { kind: 'shopName', text: shopName, reversed: true } : undefined}
        location={location}
        label='Mall name'
        triggerChangeOnFocus
        hideError
        {...cnProps}
      />
    );
  },
});

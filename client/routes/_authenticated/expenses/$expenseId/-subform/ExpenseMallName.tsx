import { withForm } from '#client/components/Form';
import type { Coordinate } from '#client/utils';
import { createEditExpenseFormOptions } from '../-common';
import { ExpenseSuggestableField, type SuggestionFieldProps } from '../-common/ExpenseSuggestableField';

type MallNameSubFormProps = { coordinate?: Coordinate } & Partial<
  Pick<SuggestionFieldProps, Extract<keyof SuggestionFieldProps, `${string}Cn`> | 'label' | 'hideError'>
>;

export const MallNameSubForm = withForm({
  ...createEditExpenseFormOptions,
  props: {} as MallNameSubFormProps,
  render({ form, ...cnProps }) {
    return (
      <form.Subscribe
        selector={state => [state.values.geolocation] as const}
        children={([{ latitude, longitude }]) => (
          <ExpenseSuggestableField
            form={form}
            fields={{ text: 'shopMall' }}
            kind='mallName'
            coordinate={latitude && longitude ? { latitude, longitude } : undefined}
            label='Mall name'
            triggerChangeOnFocus
            hideError
            {...cnProps}
          />
        )}
      />
    );
  },
});

import { withFieldGroup, type ComboBoxProps } from '#client/components/Form';
import { trpc, type RouterInputs } from '#client/trpc';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

type SuggestionInput = RouterInputs['expense']['getSuggestions'];
type SuggestionKind = SuggestionInput['kind'];
type SuggestionContext = SuggestionInput['context'];
type SuggestionCoordinate = SuggestionInput['coordinate'];

export type SuggestionFieldProps = {
  kind: SuggestionKind;
  context?: SuggestionContext;
  coordinate?: SuggestionCoordinate;
  fetchDebouncing?: number;
} & Omit<ComboBoxProps, 'options' | 'suggestionMode' | 'readOnly'>;

export const ExpenseSuggestableField = withFieldGroup({
  defaultValues: { text: '' as string | null },
  props: {} as unknown as SuggestionFieldProps,
  render({ group, kind, context, coordinate, fetchDebouncing = 500, onSuggestionSelected, ...rest }) {
    const [search, setSearch] = useState('' as null | undefined | string);
    let queryInput: SuggestionInput | typeof skipToken = skipToken;
    if (search || context || coordinate) {
      queryInput = { kind, search: search ?? '', context, coordinate };
    }
    const { data } = useQuery(trpc.expense.getSuggestions.queryOptions(queryInput));

    return (
      <group.AppField
        name='text'
        validators={{
          onChangeAsyncDebounceMs: fetchDebouncing,
          onChangeAsync: ({ value, fieldApi }) => {
            if (fieldApi.form.state.isSubmitting) return;
            setSearch(value);
          },
        }}
      >
        {field => (
          <field.ComboBox
            suggestionMode
            {...rest}
            options={(data?.suggestions ?? []).map(({ text }) => text)}
            onSuggestionSelected={suggestion => {
              group.setFieldValue('text', suggestion, { dontValidate: true });
              onSuggestionSelected?.(suggestion);
            }}
          />
        )}
      </group.AppField>
    );
  },
});

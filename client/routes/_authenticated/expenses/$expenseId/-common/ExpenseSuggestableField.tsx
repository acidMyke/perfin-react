import { withFieldGroup, type ComboBoxProps } from '#client/components/Form';
import { queryClient, trpc, type RouterInputs } from '#client/trpc';
import { useMutation } from '@tanstack/react-query';

type SuggestionInput = RouterInputs['expense']['getSuggestions'];
type SuggestionKind = SuggestionInput['kind'];
type SuggestionContext = SuggestionInput['context'];
type SuggestionCoordinate = SuggestionInput['coordinate'];

type SuggestionFieldProps = {
  kind: SuggestionKind;
  coordinate?: SuggestionCoordinate;
  getContext?: () => SuggestionContext | null;
  fetchDebouncing?: number;
} & Omit<ComboBoxProps, 'options' | 'suggestionMode' | 'readOnly'>;

export const ExpenseSuggestableField = withFieldGroup({
  defaultValues: { text: '' as string | null },
  props: {} as unknown as SuggestionFieldProps,
  render({ group, kind, coordinate, getContext, fetchDebouncing = 500, onSuggestionSelected, ...rest }) {
    const { mutate, data } = useMutation(trpc.expense.getSuggestions.mutationOptions());

    return (
      <group.AppField
        name='text'
        validators={{
          onChangeAsyncDebounceMs: 500,
          onChangeAsync: ({ value, signal, fieldApi }) => {
            if (fieldApi.form.state.isSubmitting) return;
            signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
            const context = getContext?.() ?? undefined;
            if (value || context || coordinate) {
              mutate({ kind, search: value ?? '', context, coordinate });
            }
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

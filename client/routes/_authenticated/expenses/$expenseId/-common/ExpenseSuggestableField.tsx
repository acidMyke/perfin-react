import { withFieldGroup, type ComboBoxProps } from '#client/components/Form';
import { queryClient, trpc, type RouterInputs } from '#client/trpc';
import { useMutation } from '@tanstack/react-query';

type SuggestionInput = RouterInputs['expense']['getSuggestions'];
type SuggestionScope = SuggestionInput['scope'];

type SuggestionFieldProps = {
  scope: SuggestionScope;
  getContext?: () => string | null;
  fetchDebouncing?: number;
} & Omit<ComboBoxProps, 'options' | 'suggestionMode' | 'readOnly'>;

export const ExpenseSuggestableField = withFieldGroup({
  defaultValues: { text: '' as string | null },
  props: {} as unknown as SuggestionFieldProps,
  render({ group, scope, getContext, fetchDebouncing = 500, ...rest }) {
    const { mutate, data } = useMutation(trpc.expense.getSuggestions.mutationOptions());

    return (
      <group.AppField
        name='text'
        validators={{
          onChangeAsyncDebounceMs: 500,
          onChangeAsync: ({ value, signal, fieldApi }) => {
            if (fieldApi.form.state.isSubmitting) return;
            signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
            const context = getContext?.()?.trim();
            if (value || context) {
              mutate({
                scope,
                search: value ?? '',
                context: context && context.length > 0 ? context : undefined,
              });
            }
          },
        }}
      >
        {field => <field.ComboBox suggestionMode {...rest} options={data?.suggestions ?? []} />}
      </group.AppField>
    );
  },
});

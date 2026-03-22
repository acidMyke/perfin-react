import { withFieldGroup } from '#components/Form';
import { useMutation } from '@tanstack/react-query';
import { defaultExpenseAdjustment, type TGetExpenseFormField } from '.';
import { trpc } from '#client/trpc';

export const AdjustmentDetailFieldGroup = withFieldGroup({
  defaultValues: defaultExpenseAdjustment(),
  props: {
    onRemoveClick: () => {},
    getFormField: (() => {}) as unknown as TGetExpenseFormField,
    onPricingChange: () => {},
  },
  render({ group, itemIndex, onRemoveClick, getFormField, onPricingChange }) {
    const adjustmentNameSuggestionMutation = useMutation(trpc.expense.getSuggestions.mutationOptions());

    return <li className='flex'></li>;
  },
});

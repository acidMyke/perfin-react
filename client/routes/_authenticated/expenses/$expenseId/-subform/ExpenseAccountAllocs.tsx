import { withForm, type Option } from '#client/components/Form';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { createEditExpenseFormOptions } from '../-common';
import { currencyNumberFormat } from '#client/utils';

export const ExpenseAccountAllocation = withForm({
  ...createEditExpenseFormOptions,
  props: {
    accountOptions: [] as Option[],
  },
  render({ form, accountOptions }) {
    return (
      <form.Field name='accountAllocs' mode='array'>
        {arrayField => (
          <ul className='col-span-full mt-4 flex auto-rows-auto flex-col flex-nowrap items-start gap-2 py-2 pl-2'>
            {arrayField.state.value.map((_, idx, { length }) => {
              return (
                <li className='flex w-full flex-row items-center gap-2'>
                  <form.AppField name={`accountAllocs[${idx}].account`}>
                    {({ ComboBox }) => (
                      <ComboBox
                        label='Account'
                        options={accountOptions}
                        containerCn='w-62'
                        inputCn='input-sm text-sm'
                      />
                    )}
                  </form.AppField>

                  <form.AppField name='amountCents' listeners={{/* onChange: () => onPricingChange() */}}>
                    {({ NumericInput }) => (
                      <NumericInput
                        transforms={['amountInCents']}
                        numberFormat={currencyNumberFormat}
                        containerCn='mt-0 w-28'
                        inputCn='input-sm text-sm'
                        hideError
                        disabled={idx === length - 1}
                      />
                    )}
                  </form.AppField>

                  <button
                    className='btn-ghost btn btn-sm px-0'
                    onClick={() => {
                      arrayField.pushValue({ account: undefined, amountCents: 0 });
                    }}
                  >
                    {idx !== length - 1 ? <X /> : <Plus />}
                  </button>

                  <button
                    className='btn-ghost btn btn-sm px-0'
                    onClick={() => {
                      arrayField.swapValues(idx, idx + (idx == 0 ? 1 : -1));
                    }}
                  >
                    {idx === 0 ? <ChevronDown /> : <ChevronUp />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </form.Field>
    );
  },
});

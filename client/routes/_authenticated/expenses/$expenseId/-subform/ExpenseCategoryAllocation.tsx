import { withForm, type Option } from '#client/components/Form';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { calculateExpenseFormRemainingAllocation, createEditExpenseFormOptions, usePushIntoOptions } from '../-common';
import { currencyNumberFormat, formatCents } from '#client/utils';
import { useSelector } from '@tanstack/react-form';
import { useMemo } from 'react';

export const ExpenseCategoryAllocationSubForm = withForm({
  ...createEditExpenseFormOptions,
  props: {
    categoryOptions: [] as Option[],
    readOnly: false,
  },
  render({ form, categoryOptions, readOnly }) {
    const { pushIntoOptions } = usePushIntoOptions();
    const isItemizedExpense = useSelector(form.store, state => state.values.items.length > 0);
    const categoryLabelMapping = useMemo(
      () => new Map(categoryOptions.map(({ value, label }) => [value, label] as const)),
      categoryOptions,
    );

    return (
      <>
        <label className='label mt-2 p-0'>
          <span className='label-text font-medium'>Category {isItemizedExpense ? 'breakdown' : 'allocations'}</span>
        </label>
        <form.Field key='itemized' name='ui.calculateResult.categoryResults'>
          {arrayField =>
            isItemizedExpense && (
              <ul className='col-span-full flex auto-rows-auto flex-col flex-nowrap items-start gap-2 pb-2 pl-2'>
                {arrayField.state.value.map((_, idx) => (
                  <li key={idx} className='flex w-full flex-row items-center gap-2'>
                    <form.Field name={`ui.calculateResult.categoryResults[${idx}][0]`}>
                      {field => (
                        <p className='grow'>{categoryLabelMapping.get(field.state.value) ?? field.state.value}</p>
                      )}
                    </form.Field>
                    <form.Field name={`ui.calculateResult.categoryResults[${idx}][1].netTotalCents`}>
                      {field => <p>{formatCents(field.state.value)}</p>}
                    </form.Field>
                  </li>
                ))}
              </ul>
            )
          }
        </form.Field>
        <form.Field key='itemless' name='categoryAllocs'>
          {arrayField =>
            !isItemizedExpense && (
              <ul className='col-span-full flex auto-rows-auto flex-col flex-nowrap items-start gap-2 py-2 pl-2'>
                {arrayField.state.value.map((_, idx, { length }) => {
                  const isLast = idx === length - 1;
                  return (
                    <li className='flex w-full flex-row items-center gap-2'>
                      <form.AppField
                        name={`categoryAllocs[${idx}].category`}
                        listeners={{
                          onChange: fieldApi => {
                            if (fieldApi.value && fieldApi.value.value == null) {
                              pushIntoOptions({ kind: 'category', option: fieldApi.value });
                            }
                          },
                        }}
                      >
                        {({ ComboBox }) => (
                          <ComboBox
                            label='Category'
                            options={categoryOptions}
                            containerCn='w-62'
                            inputCn='input-sm text-sm'
                            readOnly={readOnly}
                          />
                        )}
                      </form.AppField>

                      <form.AppField
                        name={`categoryAllocs[${idx}].amountCents`}
                        listeners={{
                          onChange: () => {
                            if (!isLast) calculateExpenseFormRemainingAllocation(form, 'category');
                          },
                        }}
                      >
                        {({ NumericInput }) => (
                          <NumericInput
                            transforms={['amountInCents']}
                            numberFormat={currencyNumberFormat}
                            containerCn='mt-0 w-28'
                            inputCn='input-sm text-sm'
                            hideError
                            disabled={isLast}
                            min={0}
                            readOnly={readOnly}
                          />
                        )}
                      </form.AppField>

                      {!readOnly && (
                        <>
                          <button
                            className='btn-ghost btn btn-sm px-0'
                            onClick={() => arrayField.insertValue(idx, { category: undefined, amountCents: 0 })}
                          >
                            <Plus />
                          </button>

                          <button className='btn-ghost btn btn-sm px-0' onClick={() => arrayField.removeValue(idx)}>
                            <X />
                          </button>

                          <button
                            className='btn-ghost btn btn-sm px-0'
                            disabled={length === 1}
                            onClick={() => {
                              arrayField.swapValues(idx, idx + (idx == 0 ? 1 : -1));
                            }}
                          >
                            {idx === 0 ? <ChevronDown /> : <ChevronUp />}
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )
          }
        </form.Field>
      </>
    );
  },
});

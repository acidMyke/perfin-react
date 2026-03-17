import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { queryClient, trpc } from '../../../../trpc';
import { calculateExpenseForm, createEditExpenseFormOptions, defaultExpenseItem, useExpenseForm } from './-common';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { FieldError } from '../../../../components/FieldError';
import { withForm } from '../../../../components/Form';
import { useStore } from '@tanstack/react-form';
import { Plus, X } from 'lucide-react';
import { ItemDetailFieldGroup } from './-common/ExpenseItemFieldGroup';
import { currencyNumberFormat } from '../../../../utils';
import { useCallback } from 'react';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const form = useExpenseForm();
  const { data: optionsData } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const { accountOptions, categoryOptions } = optionsData;

  return (
    <div className='mb-20 grid grid-cols-8 gap-x-2'>
      <ItemsDetailsSubForm form={form} />
      <ShopDetailSubForm form={form} />
      <form.Field name='billedAt'>
        {field => (
          <label htmlFor={field.name} className='floating-label col-span-8 mt-2'>
            <span>Date</span>
            <input
              type='datetime-local'
              id={field.name}
              name={field.name}
              placeholder='Date'
              className='input input-primary w-full text-lg'
              value={format(field.state.value, "yyyy-MM-dd'T'HH:mm")}
              onChange={e => {
                if (e.target.value === '') {
                  field.handleChange(new Date());
                } else {
                  const parsedDate = parse(e.target.value, "yyyy-MM-dd'T'HH:mm", new Date());
                  if (!isNaN(parsedDate.getTime())) {
                    field.handleChange(parsedDate);
                  }
                }
              }}
            />
            <FieldError field={field} />
          </label>
        )}
      </form.Field>
      <form.AppField name='category'>
        {({ ComboBox }) => <ComboBox label='Category' options={categoryOptions} containerCn='col-span-4 mt-2' />}
      </form.AppField>
      <form.AppField name='account'>
        {({ ComboBox }) => <ComboBox label='Account' options={accountOptions} containerCn='col-span-4 mt-2' />}
      </form.AppField>
      <form.AppField name='ui.calculateResult'>
        {field => {
          const { grossAmount } = field.state.value;
          return (
            <div className='border-t-base-content/20 col-span-full mt-6 grid grid-cols-2 border-t pt-4 text-xl *:odd:font-bold *:even:text-right'>
              <p>Gross amount:</p>
              <p>{currencyNumberFormat.format(grossAmount)}</p>
            </div>
          );
        }}
      </form.AppField>
      <form.StatusMessage />
      <form.SubmitButton
        buttonCn='col-span-full mb-4'
        label='Submit'
        doneLabel='Submitted'
        inProgressLabel='Submitting...'
      />
    </div>
  );
}

const ItemsDetailsSubForm = withForm({
  ...createEditExpenseFormOptions,
  render({ form }) {
    const isItemsSubpage = useStore(form.store, state => state.values.ui.isItemsSubpage);
    const { expenseId } = Route.useParams();
    const navigate = Route.useNavigate();
    const onRemoveClick = useCallback(
      (itemIndex: number, length: number) => {
        if (length <= 3) {
          form.setFieldValue('ui.isItemsSubpage', false);
        }

        form.removeFieldValue('items', itemIndex);
      },
      [form],
    );
    const onAddClick = useCallback(
      (length: number) => {
        form.pushFieldValue('items', defaultExpenseItem());
        if (length >= 2) {
          form.setFieldValue('ui.isItemsSubpage', true);

          navigate({
            to: '/expenses/$expenseId/items/$indexStr',
            params: { expenseId, indexStr: length.toString() },
          });
        }
      },
      [form],
    );

    return (
      <form.Field name='items' mode='array'>
        {field =>
          isItemsSubpage ? (
            <ul className='col-span-full mt-4 grid max-h-96 auto-cols-min auto-rows-fr grid-cols-1 items-center gap-2 overflow-y-scroll py-2 pr-2 pl-4'>
              {field.state.value.map((item, itemIndex) => {
                const { name, quantity } = item;

                return (
                  <>
                    <span className='col-start-1 w-full'>
                      {name} {quantity > 1 && <span>x{quantity}</span>}
                    </span>

                    {/* <span className='col-start-3 self-center justify-self-end'>
                      {currencyNumberFormat.format(grossAmount)}
                    </span> */}
                    <Link
                      className='btn btn-sm btn-primary col-start-4'
                      to='/expenses/$expenseId/items/$indexStr'
                      params={{ expenseId, indexStr: itemIndex.toString() }}
                    >
                      Edit
                    </Link>

                    <button
                      className='btn-link btn btn-sm col-start-5 p-0'
                      onClick={() => onRemoveClick(itemIndex, field.state.value.length)}
                    >
                      <X />
                    </button>
                  </>
                );
              })}

              <li key='Create' className='col-start-1 col-end-4'>
                <button
                  className='btn-soft btn-primary btn w-full justify-start'
                  onClick={() => onAddClick(field.state.value.length)}
                >
                  <Plus />
                  Add item
                </button>
              </li>
            </ul>
          ) : (
            <ul className='col-span-full mt-4 flex max-h-96 flex-col gap-y-2 overflow-y-scroll py-2 pr-2 pl-4'>
              {field.state.value.map((_, itemIndex) => {
                return (
                  <ItemDetailFieldGroup
                    key={itemIndex}
                    form={form}
                    fields={`items[${itemIndex}]`}
                    disableRemoveButton={field.state.value.length < 2}
                    onRemoveClick={() => onRemoveClick(itemIndex, field.state.value.length)}
                    itemIndex={itemIndex}
                    getFormField={form.getFieldValue.bind(form)}
                    onPricingChange={() => calculateExpenseForm(form)}
                  />
                );
              })}
              <li key='Create'>
                <button
                  className='btn-soft btn-primary btn w-2/3 justify-start'
                  onClick={() => onAddClick(field.state.value.length)}
                >
                  <Plus />
                  Add item
                </button>
              </li>
            </ul>
          )
        }
      </form.Field>
    );
  },
});

const ShopDetailSubForm = withForm({
  ...createEditExpenseFormOptions,
  render({ form }) {
    const { expenseId } = Route.useParams();
    const shopNameSuggestionMutation = useMutation(trpc.expense.getSuggestions.mutationOptions());
    const shopMallSuggestionMutation = useMutation(trpc.expense.getSuggestions.mutationOptions());
    const isCurrentLocationError = useStore(form.store, state => state.values.ui.isCurrentLocationError);

    return (
      <>
        <form.AppField name='geolocation'>
          {field => {
            const geolocation = field.state.value;
            return (
              <>
                <p className='col-span-6 mt-2 mb-4'>
                  Coordinate:{' '}
                  {geolocation
                    ? `${geolocation.latitude.toPrecision(8)}, ${geolocation.longitude.toPrecision(8)}`
                    : isCurrentLocationError
                      ? 'Unable to retrieve location'
                      : 'Unspecified'}
                </p>
                <Link
                  className='btn btn-sm btn-primary col-span-2 mt-2 mb-4'
                  to='/expenses/$expenseId/geolocation'
                  params={{ expenseId }}
                >
                  View / Edit
                </Link>
              </>
            );
          }}
        </form.AppField>
        <form.AppField
          name='shopName'
          validators={{
            onChangeAsyncDebounceMs: 500,
            onChangeAsync: ({ value, signal, fieldApi }) => {
              if (fieldApi.form.state.isSubmitting) return;
              signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
              if (value && value.length > 2) {
                shopNameSuggestionMutation.mutateAsync({
                  type: 'shopName',
                  search: value,
                });
              }
            },
          }}
        >
          {field => (
            <field.ComboBox
              suggestionMode
              label='Shop name'
              containerCn='col-span-4 mt-2'
              options={shopNameSuggestionMutation.data?.suggestions ?? []}
            />
          )}
        </form.AppField>
        <form.AppField
          name='shopMall'
          validators={{
            onChangeAsyncDebounceMs: 500,
            onChangeAsync: ({ value, signal, fieldApi }) => {
              if (fieldApi.form.state.isSubmitting) return;
              signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
              if (value && value.length > 2) {
                shopMallSuggestionMutation.mutateAsync({
                  type: 'shopMall',
                  search: value,
                });
              }
            },
          }}
        >
          {field => (
            <field.ComboBox
              suggestionMode
              label='Mall'
              containerCn='col-span-4 mt-2'
              options={shopMallSuggestionMutation.data?.suggestions ?? []}
            />
          )}
        </form.AppField>
      </>
    );
  },
});

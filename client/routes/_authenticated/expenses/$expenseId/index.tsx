import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { trpc } from '#client/trpc';
import {
  calculateExpenseForm,
  createEditExpenseFormOptions,
  useItemCallbacks,
  MAX_ITEMS_IN_MAIN,
  useAdjustmentCallbacks,
  useExpenseForm,
  setCurrentLocation,
} from './-common';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { FieldError } from '#components/FieldError';
import { withForm } from '#components/Form';
import { useStore } from '@tanstack/react-form';
import { Plus, X } from 'lucide-react';
import { ItemDetailFieldGroup } from './-common/ExpenseItemFieldGroup';
import { BillTotal } from './-common/BillTotal';
import { currencyNumberFormat } from '#client/utils';
import { AdjustmentDetailFieldGroup } from './-common/ExpenseAdjFieldGroup';
import { GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';
import { ExpenseSuggestableField } from './-common/ExpenseSuggestableField';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const form = useExpenseForm();
  const { expenseId } = Route.useParams();
  const { data: optionsData } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const { accountOptions, categoryOptions } = optionsData;

  return (
    <div className='mb-20 grid grid-cols-8 gap-x-2'>
      <ItemsDetailsSubForm form={form} />
      <ShopDetailSubForm form={form} />
      <form.Field name='billedAt'>
        {field => (
          <label htmlFor={field.name} className='floating-label col-span-8 mt-4'>
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
      <AdjustmentsDetailsSubForm form={form} />
      <BillTotal className='col-span-8' />
      <form.StatusMessage />
      <form.SubmitButton
        buttonCn='col-span-full mb-4'
        label='Submit'
        doneLabel='Submitted'
        inProgressLabel='Submitting...'
      />
      {expenseId === 'create' ? (
        <Link className='btn col-span-4 w-full' to='/expenses'>
          Cancel
        </Link>
      ) : (
        <Link className='btn col-span-4 w-full' to='/expenses/$expenseId/view' params={{ expenseId }}>
          Cancel
        </Link>
      )}
      <form.ResetButton buttonCn='col-span-4 mt-0 btn-md btn-warning' />
    </div>
  );
}

const ItemsDetailsSubForm = withForm({
  ...createEditExpenseFormOptions,
  render({ form }) {
    const { expenseId } = Route.useParams();
    const navigate = Route.useNavigate();
    const { createItem, removeItem } = useItemCallbacks(form, expenseId, navigate);
    const { createAdjustment } = useAdjustmentCallbacks(form);

    return (
      <form.Field name='items' mode='array'>
        {field =>
          field.state.value.length == 0 ? (
            <form.AppField name='specifiedAmountCents' listeners={{ onChange: () => calculateExpenseForm(form) }}>
              {({ NumericInput }) => (
                <>
                  <button
                    className='btn-soft btn-lg btn-primary btn col-span-4 mt-2 w-full justify-start'
                    onClick={() => createItem(field.state.value.length)}
                  >
                    <Plus />
                    Specify items
                  </button>
                  <NumericInput
                    label='Total amount'
                    transforms={['amountInCents']}
                    numberFormat={currencyNumberFormat}
                    containerCn='mt-2 col-span-4'
                    inputCn='input-lg'
                  />
                </>
              )}
            </form.AppField>
          ) : field.state.value.length > MAX_ITEMS_IN_MAIN ? (
            <ul className='col-span-full mt-4 grid max-h-96 auto-cols-min auto-rows-fr grid-cols-1 items-center gap-2 overflow-y-scroll py-2 pr-2 pl-4'>
              {field.state.value.map((item, itemIndex) => {
                const { name, quantity } = item;

                return (
                  <>
                    <span className='col-start-1 w-full'>
                      {name} {quantity > 1 && <span>x{quantity}</span>}
                    </span>

                    <Link
                      className='btn btn-sm btn-primary col-start-4'
                      to='/expenses/$expenseId/items/$indexStr'
                      params={{ expenseId, indexStr: itemIndex.toString() }}
                    >
                      Edit
                    </Link>

                    <button
                      className='btn-link btn btn-sm col-start-5 p-0'
                      onClick={() => removeItem(itemIndex, field.state.value.length)}
                    >
                      <X />
                    </button>
                  </>
                );
              })}

              <li key='Create' className='col-start-1 col-end-4'>
                <button
                  className='btn-soft btn-primary btn w-full justify-start'
                  onClick={() => createItem(field.state.value.length)}
                >
                  <Plus />
                  Add item
                </button>
              </li>
            </ul>
          ) : (
            <ul className='col-span-full mt-4 flex max-h-96 flex-col gap-y-2 overflow-y-scroll py-2 pr-2 pl-4'>
              {field.state.value.map(({ id }, itemIndex) => {
                return (
                  <ItemDetailFieldGroup
                    key={id}
                    form={form}
                    fields={`items[${itemIndex}]`}
                    onRemoveClick={() => removeItem(itemIndex, field.state.value.length)}
                    itemIndex={itemIndex}
                    getFormField={form.getFieldValue.bind(form)}
                    onPricingChange={() => calculateExpenseForm(form)}
                    createAdjustment={expenseItemId => createAdjustment({ expenseItemId })}
                  />
                );
              })}
              <li key='Create'>
                <button
                  className='btn-soft btn-primary btn w-2/3 justify-start'
                  onClick={() => createItem(field.state.value.length)}
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
    const isPhysical = useStore(form.store, state => state.values.type === 'physical');
    const isCreate = useStore(form.store, state => state.values.ui.isCreate);
    const { expenseId } = Route.useParams();

    if (!isPhysical) {
      return (
        <>
          <button
            className='btn btn-link col-span-8'
            onClick={() => {
              form.setFieldValue('type', 'physical');
              if (isCreate) setCurrentLocation(form);
            }}
          >
            Convert to physical
          </button>
          <ExpenseSuggestableField
            form={form}
            fields={{ text: 'shopName' }}
            scope='shopName'
            getContext={() => form.getFieldValue('shopMall')}
            label='Shop name'
            containerCn='col-span-8 mt-2'
            triggerChangeOnFocus
            hideError
          />
        </>
      );
    }

    return (
      <>
        <form.AppField name='geolocation'>
          {field => {
            const geolocation = field.state.value;
            return (
              <p className='col-span-5 mt-2 mb-4'>
                Coordinate:{' '}
                {geolocation.latitude && geolocation.longitude
                  ? `${geolocation.latitude.toPrecision(8)}, ${geolocation.longitude.toPrecision(8)}`
                  : geolocation.isError
                    ? 'Unable to retrieve location'
                    : 'Unspecified'}
              </p>
            );
          }}
        </form.AppField>
        <button
          className='btn btn-link btn-secondary'
          onClick={() => {
            form.setFieldValue('type', 'online');
            form.setFieldValue('geolocation', { latitude: null, longitude: null, accuracy: null, isError: false });
          }}
        >
          Online
        </button>
        <Link
          className='btn btn-sm btn-primary col-span-2 mt-2 mb-4'
          to='/expenses/$expenseId/geolocation'
          params={{ expenseId }}
        >
          View / Edit
        </Link>
        <ExpenseSuggestableField
          form={form}
          fields={{ text: 'shopName' }}
          scope='shopName'
          getContext={() => form.getFieldValue('shopMall')}
          label='Shop name'
          containerCn='col-span-4 mt-2'
          triggerChangeOnFocus
          hideError
        />
        <ExpenseSuggestableField
          form={form}
          fields={{ text: 'shopMall' }}
          scope='shopMall'
          label='Mall'
          containerCn='col-span-4 mt-2'
          triggerChangeOnFocus
          hideError
        />
      </>
    );
  },
});

const AdjustmentsDetailsSubForm = withForm({
  ...createEditExpenseFormOptions,
  render({ form }) {
    const { removeAdjustment, createAdjustment, toggleAdjustmentType } = useAdjustmentCallbacks(form);
    return (
      <form.Field name='adjustments' mode='array'>
        {field => {
          let hasGst = false;
          let hasServiceCharge = false;
          return (
            <ul className='col-span-full mt-4 flex auto-rows-auto flex-col flex-nowrap items-start gap-2 py-2 pl-2'>
              {field.state.value.map(({ id, name }, adjIndex) => {
                hasGst ||= name === GST_NAME;
                hasServiceCharge ||= name === SERVICE_CHARGE_NAME;
                return (
                  <AdjustmentDetailFieldGroup
                    key={id}
                    form={form}
                    adjIndex={adjIndex}
                    fields={`adjustments[${adjIndex}]`}
                    onRemoveClick={adjIndex => removeAdjustment(adjIndex)}
                    getFormField={form.getFieldValue.bind(form)}
                    onPricingChange={() => calculateExpenseForm(form)}
                    toggleAdjustmentType={(adjIndex, itemId) => toggleAdjustmentType(adjIndex, itemId)}
                    onSwapClick={adjIndex => {
                      field.swapValues(adjIndex, adjIndex + (adjIndex == 0 ? 1 : -1));
                      calculateExpenseForm(form);
                    }}
                  />
                );
              })}
              <li key='add' className='flex w-full flex-row items-start gap-2'>
                {!hasServiceCharge && (
                  <button
                    className='btn-soft btn-primary btn'
                    onClick={() => createAdjustment({ special: SERVICE_CHARGE_NAME })}
                  >
                    <Plus />
                    Service charge
                  </button>
                )}
                {!hasGst && (
                  <button
                    className='btn-soft btn-secondary btn'
                    onClick={() => createAdjustment({ special: GST_NAME })}
                  >
                    <Plus />
                    GST
                  </button>
                )}
                <button className='btn-soft btn-primary btn' onClick={() => createAdjustment()}>
                  <Plus />
                  Adjustment
                </button>
              </li>
            </ul>
          );
        }}
      </form.Field>
    );
  },
});

import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import { FieldError } from './FieldError';

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

type MarginVal = 0 | 4 | 8 | 12;
const getMarginTop = (val: MarginVal) =>
  ({
    '0': '',
    '4': 'mt-4',
    '8': 'mt-8',
    '12': 'mt-12',
  })[val];

type TextInputProps = {
  label: string;
  type: 'text' | 'password' | 'email' | 'search';
  marginTop?: MarginVal;
};

function TextInput(props: TextInputProps) {
  const { label, type, marginTop = 8 } = props;
  const field = useFieldContext<string>();
  let labelClassName = 'floating-label';
  if (marginTop) {
    labelClassName += ' ' + getMarginTop(marginTop);
  }

  return (
    <label htmlFor={field.name} className={labelClassName}>
      <span>{label}</span>
      <input
        type={type}
        id={field.name}
        name={field.name}
        placeholder={label}
        className='input input-primary input-xl w-full'
        value={field.state.value}
        onChange={e => field.handleChange(() => e.target.value)}
      />
      <FieldError field={field} />
    </label>
  );
}

type SubmitButtonProps = {
  label: string;
  doneLabel?: string;
  inProgressLabel?: string;
  marginTop?: MarginVal;
};

function SubmitButton(props: SubmitButtonProps) {
  const { label, doneLabel, inProgressLabel, marginTop = 8 } = props;
  const form = useFormContext();

  return (
    <form.Subscribe
      selector={state => [state.isPristine, state.canSubmit, state.isSubmitting, state.isSubmitSuccessful]}
    >
      {([isPristine, canSubmit, isSubmitting, isSubmitSuccessful]) => (
        <button
          type='button'
          className={`btn btn-primary btn-lg btn-block ${getMarginTop(marginTop)}`}
          disabled={isPristine || !canSubmit || isSubmitting}
          onClick={() => form.handleSubmit()}
        >
          {isSubmitting && <span className='loading loading-dots loading-md'></span>}
          {isSubmitting ? (inProgressLabel ?? label) : isSubmitSuccessful ? (doneLabel ?? label) : label}
        </button>
      )}
    </form.Subscribe>
  );
}

export const { useAppForm } = createFormHook({
  formContext,
  fieldContext,
  formComponents: {
    SubmitButton,
  },
  fieldComponents: {
    TextInput,
  },
});

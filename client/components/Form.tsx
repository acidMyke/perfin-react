import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import { FieldError } from './FieldError';
import { twMerge } from 'tailwind-merge';
import clsx from 'clsx';
import type { ClassValue } from 'clsx';

export const cn = (...input: ClassValue[]) => twMerge(clsx(input));

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

type TextInputProps = {
  label: string;
  type: 'text' | 'password' | 'email' | 'search';
  containerCn?: string;
  labelCn?: string;
  inputCn?: string;
};

function TextInput(props: TextInputProps) {
  const { label, type, containerCn, labelCn, inputCn } = props;
  const field = useFieldContext<string>();

  return (
    <label htmlFor={field.name} className={cn('floating-label mt-8', containerCn)}>
      <span className={labelCn}>{label}</span>
      <input
        type={type}
        id={field.name}
        name={field.name}
        placeholder={label}
        className={cn('input input-primary input-xl w-full', inputCn)}
        value={field.state.value ?? ''}
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
  buttonCn?: string;
  loadingCn?: string;
};

function SubmitButton(props: SubmitButtonProps) {
  const { label, doneLabel, inProgressLabel, buttonCn, loadingCn } = props;
  const form = useFormContext();

  return (
    <form.Subscribe
      selector={state => [state.isPristine, state.canSubmit, state.isSubmitting, state.isSubmitSuccessful]}
    >
      {([isPristine, canSubmit, isSubmitting, isSubmitSuccessful]) => (
        <button
          type='button'
          className={cn('btn btn-primary btn-lg btn-block mt-8', buttonCn)}
          disabled={isPristine || !canSubmit || isSubmitting}
          onClick={() => form.handleSubmit()}
        >
          {isSubmitting && <span className={cn('loading loading-dots loading-md', loadingCn)}></span>}
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

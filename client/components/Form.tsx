import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import { FieldError } from './FieldError';
import clsx from 'clsx';
import type { ClassValue } from 'clsx';
import { useState } from 'react';
import CreatableSelect from 'react-select/creatable';
import { twMerge } from '../twMerge';

export const cn = (...input: ClassValue[]) => twMerge(clsx(input));

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

type TextInputProps = {
  label: string;
  type: 'text' | 'password' | 'email' | 'search';
  containerCn?: string;
  labelCn?: string;
  inputCn?: string;
  transform?: 'uppercase';
};

function TextInput(props: TextInputProps) {
  const { label, type, containerCn, labelCn, inputCn, transform } = props;
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
        onChange={e => {
          let value = e.target.value;
          if (transform === 'uppercase') {
            value = value.toUpperCase();
          }
          field.handleChange(() => value);
        }}
      />
      <FieldError field={field} />
    </label>
  );
}

type Option = {
  label: string;
  value: string;
};

type CreatableSelectProps = {
  label: string;
  options: Option[];
  placeholder?: string;
  maxMenuHeight?: number;
  containerCn?: string;
  labelCn?: string;
};

function ComboBox(props: CreatableSelectProps) {
  const { label, options, placeholder = 'Unspecified', maxMenuHeight = 124, containerCn, labelCn } = props;
  const field = useFieldContext<Option | undefined>();
  const [createOption, setCreateOption] = useState<Option | undefined>();

  return (
    <label htmlFor={field.name} className={cn('floating-label', containerCn)}>
      <span className={cn('text-lg', labelCn)}>{label}</span>
      <CreatableSelect
        options={createOption ? [...options, createOption] : options}
        placeholder={placeholder}
        classNamePrefix='react-select-lg'
        unstyled
        maxMenuHeight={maxMenuHeight}
        isClearable
        isSearchable
        value={field.state.value}
        getNewOptionData={label => ({ label, value: 'create' })}
        createOptionPosition='first'
        formatCreateLabel={label => 'Create: ' + label}
        onChange={(v, meta) => {
          if (v === null) {
            field.handleChange(undefined);
            return;
          }
          if (meta.action === 'create-option') setCreateOption(v);
          field.handleChange(v);
        }}
      />
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
    ComboBox,
  },
});

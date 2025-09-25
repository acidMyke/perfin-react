import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import clsx from 'clsx';
import type { ClassValue } from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import CreatableSelect from 'react-select/creatable';
import { twMerge } from '../twMerge';
import { FieldError } from './FieldError';

export const cn = (...input: ClassValue[]) => twMerge(clsx(input));
const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

const NumericTransformers = {
  amountInCents: {
    transform: v => v * 100,
    revert: v => v / 100,
  },
} satisfies Record<string, { transform: (v: number) => number; revert: (v: number) => number }>;

type NumericInputProps = {
  label?: string;
  containerCn?: string;
  labelCn?: string;
  inputCn?: string;
  nullIfZero?: boolean;
  transforms?: (keyof typeof NumericTransformers)[];
  numberFormat?: Intl.NumberFormat;

  min?: number;
  max?: number;
  step?: number;
};

function NumericInput(props: NumericInputProps) {
  const { label, containerCn, labelCn, inputCn, nullIfZero, transforms = [], numberFormat, ...inputProps } = props;
  const formatOptions = useMemo(() => numberFormat?.resolvedOptions(), [numberFormat]);
  const formatValue = useCallback(
    (val: number | null) => {
      if (!numberFormat) {
        return { prefix: '', number: (val ?? 0).toString(), postfix: '' };
      } else {
        const parts = numberFormat.formatToParts(val ?? 0);

        let prefix = '';
        let numberStr = '';
        let postfix = '';
        let inNumber = false;

        for (const part of parts) {
          if (['plusSign'].includes(part.type)) {
            continue;
          } else if (['integer', 'group', 'decimal', 'fraction', 'minusSign'].includes(part.type)) {
            inNumber = true;
            if (part.type !== 'group') {
              // remove commas
              numberStr += part.value;
            }
          } else if (!inNumber) {
            prefix += part.value;
          } else {
            postfix += part.value;
          }
        }

        return {
          prefix: prefix.replace(/\u00A0/g, ' '),
          number: numberStr,
          postfix: postfix.replace(/\u00A0/g, ' '),
        };
      }
    },
    [numberFormat],
  );
  const { prefix, postfix } = useMemo<Omit<ReturnType<typeof formatValue>, 'number'>>(
    () => formatValue(0),
    [formatValue],
  );
  const field = useFieldContext<number | null>();
  const [formatted, setFormatted] = useState<string>(() => {
    const val = field.state.value ?? 0;
    return val == 0 ? '' : formatValue(val).number;
  });

  useEffect(() => {
    const value = transforms.reduce((a, t) => NumericTransformers[t].revert(a), field.state.value ?? 0);
    const newFormatted = formatValue(value).number;
    if ((formatted !== '') == (value !== 0) && formatted != newFormatted) {
      setFormatted(newFormatted);
    }
  }, [formatValue, field.state.value]);

  return (
    <label htmlFor={field.name} className={cn('floating-label mt-8', containerCn)}>
      {label && <span className={labelCn}>{label}</span>}
      <label htmlFor='' className={cn('input input-primary input-xl w-full', inputCn)}>
        {prefix && <span>{prefix}</span>}
        <input
          step={1 / Math.pow(10, formatOptions?.maximumFractionDigits ?? 1)}
          {...inputProps}
          type='number'
          id={field.name}
          name={field.name}
          placeholder={label}
          value={formatted}
          onChange={e => {
            if (e.target.value === '') setFormatted('');
            const value = parseFloat(e.target.value);
            if (!isNaN(value)) setFormatted(e.target.value);
          }}
          onBlur={() => {
            const value = parseFloat(formatted);
            if (isNaN(value) && !nullIfZero) {
              field.setErrorMap({ onBlur: 'Invalid number' });
              return;
            }
            if ((nullIfZero && value === 0) || isNaN(value)) field.handleChange(() => null);
            else field.handleChange(() => transforms.reduce((a, t) => NumericTransformers[t].transform(a), value));
            field.setErrorMap({ onBlur: '' });
          }}
        />
        {postfix && <span>{postfix}</span>}
      </label>
      <FieldError field={field} />
    </label>
  );
}

const TextTransformers = {
  uppercase: value => value.toUpperCase(),
} satisfies Record<string, (v: string) => string>;

type TextInputProps = {
  label?: string;
  type: 'text' | 'password' | 'email' | 'search';
  containerCn?: string;
  labelCn?: string;
  inputCn?: string;
  /** @deprecated Use transforms instead */
  transform?: keyof typeof TextTransformers;
  transforms?: (keyof typeof TextTransformers)[];
  nullIfEmpty?: boolean;
};

function TextInput(props: TextInputProps) {
  const { label, type, containerCn, labelCn, inputCn, nullIfEmpty } = props;
  const field = useFieldContext<string | null>();

  let transforms = props.transform
    ? props.transforms
      ? [...props.transforms, props.transform]
      : [props.transform]
    : (props.transforms ?? []);

  return (
    <label htmlFor={field.name} className={cn('floating-label mt-8', containerCn)}>
      {label && <span className={labelCn}>{label}</span>}
      <input
        type={type}
        id={field.name}
        name={field.name}
        className={cn('input input-primary input-xl w-full', inputCn)}
        value={field.state.value ?? ''}
        onChange={e => {
          const value = transforms.reduce((a, t) => TextTransformers[t](a), e.target.value as string);
          if (nullIfEmpty && value === '') {
            field.handleChange(() => null);
          } else {
            field.handleChange(() => value);
          }
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
    NumericInput,
  },
});

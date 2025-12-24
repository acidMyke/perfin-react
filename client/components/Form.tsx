import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import clsx from 'clsx';
import type { ClassValue } from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { twMerge } from '../twMerge';
import { FieldError } from './FieldError';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';

export const cn = (...input: ClassValue[]) => twMerge(clsx(input));
export const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

const NumericTransformers = {
  amountInCents: {
    transform: v => v * 100,
    revert: v => v / 100,
  },
  percentage: {
    transform: v => v * 100,
    revert: v => v / 100,
  },
} satisfies Record<string, { transform: (v: number) => number; revert: (v: number) => number }>;

type NumericInputProps = {
  label?: string | null;
  containerCn?: string;
  labelCn?: string;
  inputCn?: string;
  innerInputCn?: string;
  nullIfZero?: boolean;
  transforms?: (keyof typeof NumericTransformers)[];
  transformFor?: 'default' | 'formatOnly';
  numberFormat?: Intl.NumberFormat;
  additionalSuffix?: string;

  min?: number;
  max?: number;
  step?: number;
  readOnly?: boolean;
  disabled?: boolean;
};

function NumericInput(props: NumericInputProps) {
  const {
    label,
    containerCn,
    labelCn,
    inputCn,
    innerInputCn,
    nullIfZero,
    transforms = [],
    transformFor = 'default',
    numberFormat,
    additionalSuffix,
    ...inputProps
  } = props;
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

  const inputEl = (
    <label htmlFor='' className={cn('input input-primary input-xl w-full', inputCn)}>
      {prefix && <span>{prefix}</span>}
      <input
        className={innerInputCn}
        step={1 / Math.pow(10, formatOptions?.maximumFractionDigits ?? 1)}
        {...inputProps}
        type='number'
        id={field.name}
        name={field.name}
        placeholder={label ?? undefined}
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
          else if (transformFor === 'formatOnly') field.handleChange(value);
          else field.handleChange(() => transforms.reduce((a, t) => NumericTransformers[t].transform(a), value));

          field.setErrorMap({ onBlur: undefined });
        }}
        onFocus={e => e.currentTarget.select()}
      />
      {postfix && <span>{postfix}</span>}
      {additionalSuffix && <span>{additionalSuffix}</span>}
    </label>
  );

  if (label === null) {
    return <div className={containerCn}>{inputEl}</div>;
  }

  return (
    <label htmlFor={field.name} className={cn('floating-label mt-8', containerCn)}>
      <span className={labelCn}>{label}</span>
      {inputEl}
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
  readOnly?: boolean;
  /** @deprecated Use transforms instead */
  transform?: keyof typeof TextTransformers;
  transforms?: (keyof typeof TextTransformers)[];
  nullIfEmpty?: boolean;
  autoComplete?: string;
};

function TextInput(props: TextInputProps) {
  const { label, type, containerCn, labelCn, inputCn, nullIfEmpty, autoComplete } = props;
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
        autoComplete={autoComplete}
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

type BooleanInputProps = {
  label?: string;
  style?: 'toggle' | 'checkbox';
  nullIfFalse?: boolean;
  labelCn?: string;
  inputCn?: string;
  transformValue?: (value: boolean) => boolean | number | string | null;
};

function BooleanInput(props: BooleanInputProps) {
  const { label, style = 'toggle', nullIfFalse, labelCn, inputCn, transformValue } = props;
  const field = useFieldContext<boolean | number | string | null>();

  const styleIsToggle = style === 'toggle';

  return (
    <label className={cn('label text-primary-content w-full', labelCn)}>
      {label}
      <input
        type='checkbox'
        checked={!!field.state.value}
        className={cn(style, styleIsToggle ? 'toggle-primary toggle-xl' : 'checkbox-primary checkbox-xl', inputCn)}
        onChange={e => {
          const checked = e.currentTarget.checked;
          if (nullIfFalse && !checked) field.handleChange(null);
          else if (transformValue) field.handleChange(transformValue(checked));
          else field.handleChange(checked);
        }}
      />
    </label>
  );
}

export type Option = {
  label: string;
  value: string;
};

type ComboBoxProps = {
  label: string;
  options: (Option | string)[];
  maxMenuHeight?: number;
  containerCn?: string;
  labelCn?: string;
  suggestionMode?: boolean;
  readOnly?: boolean;
  triggerChangeOnFocus?: boolean;
};

function ComboBox({
  label,
  options,
  maxMenuHeight = 300,
  containerCn,
  labelCn,
  suggestionMode = false,
  readOnly = false,
  triggerChangeOnFocus = false,
}: ComboBoxProps) {
  const field = useFieldContext<Option | string | undefined>();

  // Compute the input value from form state
  const inputValue = suggestionMode
    ? typeof field.state.value === 'string'
      ? field.state.value
      : ''
    : (field.state.value as Option)?.label || '';

  const comboboxValue = suggestionMode
    ? null // free-text, menu selection does not control value
    : (field.state.value as Option | null) || null;

  return (
    <label className={cn('floating-label z-10 flex flex-col gap-1', containerCn)}>
      <span className={cn('text-lg', labelCn)}>{label}</span>

      <Combobox
        value={comboboxValue}
        onChange={option => {
          if (!option) return;
          if (suggestionMode) {
            field.handleChange(option.label); // or .label
            field.handleBlur();
          } else {
            field.handleChange(option); // store Option object
          }
        }}
        disabled={readOnly}
        immediate
      >
        <div className='relative'>
          <ComboboxInput
            className={cn(
              'w-full rounded border border-gray-300 px-3 py-2',
              'focus:ring-primary border-primary focus:ring-2 focus:outline-none',
              'bg-base-100 text-lg',
            )}
            placeholder={label}
            value={inputValue}
            onChange={e => {
              const val = e.target.value;
              if (suggestionMode) {
                field.handleChange(val);
              } else {
                field.handleChange({ label: val, value: val });
              }
            }}
            onBlur={() => field.handleBlur()}
            onFocus={e => {
              if (suggestionMode && triggerChangeOnFocus) {
                const val = e.target.value;
                if (e.target.value === '') field.handleChange(val);
              }
            }}
          />

          <div className='pointer-events-none absolute inset-y-0 right-3 flex items-center'>
            <ChevronDown className='h-5 w-5 text-gray-400' />
          </div>
          <ComboboxOptions
            className='bg-base-100 absolute z-10 mt-1 w-full overflow-auto rounded-lg shadow-lg'
            style={{ maxHeight: maxMenuHeight }}
          >
            {options.map(opt => (
              <ComboboxOption
                key={typeof opt === 'string' ? opt : opt.value}
                value={opt}
                className={({ focus, selected }) =>
                  cn('cursor-pointer rounded px-3 py-2', { 'bg-base-200': focus }, { 'bg-base-300': selected })
                }
              >
                {typeof opt === 'string' ? opt : opt.label}
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        </div>
      </Combobox>

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
  disabled?: boolean;
  allowPristine?: boolean;
};

function SubmitButton(props: SubmitButtonProps) {
  const { label, doneLabel, inProgressLabel, buttonCn, loadingCn, disabled, allowPristine } = props;
  const form = useFormContext();

  return (
    <form.Subscribe
      selector={state => [state.isPristine, state.canSubmit, state.isSubmitting, state.isSubmitSuccessful]}
    >
      {([isPristine, canSubmit, isSubmitting, isSubmitSuccessful]) => (
        <button
          type='button'
          className={cn('btn btn-primary btn-lg btn-block mt-8', buttonCn)}
          disabled={(!allowPristine && isPristine) || !canSubmit || isSubmitting || disabled}
          onClick={() => form.handleSubmit()}
        >
          {isSubmitting && <span className={cn('loading loading-dots loading-md', loadingCn)}></span>}
          {isSubmitting ? (inProgressLabel ?? label) : isSubmitSuccessful ? (doneLabel ?? label) : label}
        </button>
      )}
    </form.Subscribe>
  );
}

type StatusMessageProps = {
  takeOne?: boolean;
};

function StatusMessage({ takeOne }: StatusMessageProps) {
  const form = useFormContext();
  const errors = form.state.errors;
  const errMsgs = [];

  for (const err of errors) {
    if (typeof err === 'undefined') {
      if (import.meta.env.DEV) {
        errMsgs.push('[undefined]');
      }
    } else if (typeof err === 'string') {
      errMsgs.push(err);
    } else if (typeof err === 'object') {
      if (Array.isArray(err)) {
        if (err.length > 0) {
          errMsgs.push(err.join(', '));
        }
      } else if ('message' in err) {
        errMsgs.push(err.message);
      } else if (import.meta.env.DEV) {
        errMsgs.push('[' + JSON.stringify(err) + ']');
      }
    } else {
      errMsgs.push('[unknown]');
    }
    if (takeOne && errMsgs.length > 0) break;
  }

  return (
    <div className='flex w-full flex-col gap-6'>
      {errMsgs.map(msg => (
        <div role='alert' className='alert alert-error'>
          <TriangleAlert />
          <span>{msg}</span>
        </div>
      ))}
    </div>
  );
}

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  formContext,
  fieldContext,
  formComponents: {
    SubmitButton,
    StatusMessage,
  },
  fieldComponents: {
    TextInput,
    ComboBox,
    NumericInput,
    BooleanInput,
  },
});

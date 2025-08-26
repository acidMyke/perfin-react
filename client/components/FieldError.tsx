import type { AnyFieldApi } from '@tanstack/react-form';

type FieldErorProps = {
  field: AnyFieldApi;
  takeOne?: boolean;
};
export function FieldError({ field, takeOne = false }: FieldErorProps) {
  const errors = field.state.meta.errors;
  let errMsgs = [];

  for (const err of errors) {
    if (typeof err === 'undefined') {
      if (import.meta.env.DEV) {
        errMsgs.push('[undefined]');
      }
    } else if (typeof err === 'string') {
      errMsgs.push(err);
    } else if (typeof err === 'object') {
      if ('message' in err) {
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
    <p role='alert' className='text-error h-[1em] text-sm'>
      {errMsgs.join(', ')}
    </p>
  );
}

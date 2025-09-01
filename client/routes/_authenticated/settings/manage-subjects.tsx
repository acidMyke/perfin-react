import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { queryClient, trpc } from '../../../trpc';
import { SUBJECT_TYPES_TUPLE, type SubjectType } from '../../../../db/enum';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useAppForm } from '../../../components/Form';
import { PageHeader } from '../../../components/PageHeader';
import { ChevronDown, ChevronUp, PenLine } from 'lucide-react';
import { useRef } from 'react';

export const Route = createFileRoute('/_authenticated/settings/manage-subjects')({
  component: RouteComponent,
  validateSearch(search) {
    if (!search || typeof search.type !== 'string') {
      throw redirect({ to: '/settings' });
    }

    // @ts-expect-error
    if (!SUBJECT_TYPES_TUPLE.includes(search.type)) {
      throw notFound();
    }

    return { type: search.type as SubjectType };
  },
  loaderDeps: ({ search }) => ({ subjectType: search.type }),
  loader: async ({ deps }) => {
    const { subjectType } = deps;
    await queryClient.ensureQueryData(trpc.subject.list.queryOptions({ subjectType }));
  },
});

function RouteComponent() {
  const modalRef = useRef<HTMLDialogElement>(null);
  const { subjectType } = Route.useLoaderDeps();
  const { data: subjects } = useSuspenseQuery(trpc.subject.list.queryOptions({ subjectType }));
  const form = useAppForm({
    defaultValues: {
      subjects,
      selected: {
        index: null as number | null,
        name: '',
        description: '' as string | null,
      },
    },
  });

  return (
    <div className='mx-auto max-w-md'>
      <PageHeader title={'Manage ' + subjectType} showBackButton />
      <form.AppForm>
        <form.Field name='subjects' mode='array'>
          {field => (
            <ul className='list bg-base-100 rounded-box shadow-md'>
              {field.state.value.map(({ id, name, description }, subIndex, { length }) => (
                <li key={id} className='list-row'>
                  <div className='list-col-grow'>
                    <div className='text-xl'>{name}</div>
                    <div className='text-xs'>{description}</div>
                  </div>
                  <button
                    className='btn btn-square btn-ghost'
                    onClick={() => {
                      form.setFieldValue('selected', {
                        index: subIndex,
                        name,
                        description,
                      });
                      modalRef.current?.showModal();
                    }}
                  >
                    <PenLine />
                  </button>
                  <button
                    className='btn btn-square btn-ghost'
                    disabled={subIndex === 0}
                    onClick={() => field.swapValues(subIndex, subIndex - 1)}
                  >
                    <ChevronUp />
                  </button>
                  <button
                    className='btn btn-square btn-ghost'
                    disabled={subIndex === length - 1}
                    onClick={() => field.swapValues(subIndex, subIndex + 1)}
                  >
                    <ChevronDown />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form.Field>
        {/* Open the modal using document.getElementById('ID').showModal() method */}
        <dialog ref={modalRef} className='modal'>
          <div className='modal-box'>
            <h3 className='text-lg font-bold'>Edit subject</h3>
            <form.AppField name='selected.name'>
              {({ TextInput }) => <TextInput type='text' label='Name' />}
            </form.AppField>
            <form.AppField name='selected.description'>
              {({ TextInput }) => <TextInput type='text' label='Description' transform='emptyIsNull' />}
            </form.AppField>
            <form.Subscribe
              selector={({ values: { selected, subjects } }) => {
                if (selected.index == null) return [null, null, false] as const;
                const defaultValue = subjects[selected.index];
                return [
                  selected.index,
                  defaultValue,
                  selected.index != null &&
                    (defaultValue.name !== selected.name ||
                      (defaultValue.description ?? '') !== (selected.description ?? '')),
                ] as const;
              }}
            >
              {([selectedIndex, defaultValue, valueChanged]) => (
                <div className='modal-action'>
                  <button
                    type='button'
                    className='btn btn-sm btn-neutral'
                    onClick={() => {
                      if (selectedIndex === null || defaultValue === null) return;
                      if (valueChanged) {
                        form.setFieldValue('selected', { index: selectedIndex, ...defaultValue });
                      } else {
                        modalRef.current?.close();
                        form.resetField('selected');
                      }
                    }}
                  >
                    {valueChanged ? 'Reset' : 'Close'}
                  </button>
                  <button type='button' className='btn btn-sm btn-primary' disabled={!valueChanged}>
                    Update & Close
                  </button>
                </div>
              )}
            </form.Subscribe>
          </div>
        </dialog>
      </form.AppForm>
    </div>
  );
}

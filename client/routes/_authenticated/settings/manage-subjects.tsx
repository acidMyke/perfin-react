import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { handleFormMutateAsync, queryClient, trpc } from '../../../trpc';
import { SUBJECT_TYPES_TUPLE, type SubjectType } from '../../../../db/enum';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { useAppForm } from '../../../components/Form';
import { PageHeader } from '../../../components/PageHeader';
import { ChevronDown, ChevronUp, Undo } from 'lucide-react';

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
  const navigate = Route.useNavigate();
  const { subjectType } = Route.useLoaderDeps();
  const { data: subjects } = useSuspenseQuery(trpc.subject.list.queryOptions({ subjectType }));
  const originalSubjectMap = new Map<string, (typeof subjects)[number]>(subjects.map(s => [s.id, s]));
  const saveMutation = useMutation(trpc.subject.save.mutationOptions());
  const form = useAppForm({
    defaultValues: { subjects },
    validators: {
      onSubmitAsync: async ({ value, signal }) => {
        signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.session.signIn.mutationKey() });
        const subjects = value.subjects;
        const formError = await handleFormMutateAsync(saveMutation.mutateAsync({ subjects, subjectType }));
        if (formError) {
          return formError;
        }
        queryClient.invalidateQueries(trpc.subject.list.queryOptions({ subjectType }));
        navigate({ to: '/settings' });
      },
    },
  });

  return (
    <div className='mx-auto max-w-md'>
      <PageHeader title={'Manage ' + subjectType} showBackButton />
      <form.AppForm>
        <form.Field name='subjects' mode='array'>
          {field => (
            <ul className='list bg-base-100 rounded-box mt-4 shadow-md'>
              {field.state.value.map(({ id }, subjectIndex, { length }) => (
                <li key={id} className='list-row p-2'>
                  <div className='list-col-grow'>
                    <form.AppField
                      name={`subjects[${subjectIndex}].name`}
                      validators={{ onChange: v => (v.value == '' ? 'Cannot be empty' : '') }}
                    >
                      {({ TextInput }) => (
                        <TextInput type='text' containerCn='mt-0' inputCn='input-md input-neutral' label='Name' />
                      )}
                    </form.AppField>
                  </div>
                  <button
                    className='btn btn-square btn-ghost'
                    disabled={subjectIndex === 0}
                    onClick={() => field.swapValues(subjectIndex, subjectIndex - 1)}
                  >
                    <ChevronUp />
                  </button>
                  <button
                    className='btn btn-square btn-ghost'
                    disabled={subjectIndex === length - 1}
                    onClick={() => field.swapValues(subjectIndex, subjectIndex + 1)}
                  >
                    <ChevronDown />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form.Field>
        <form.SubmitButton label='Save' />
      </form.AppForm>
    </div>
  );
}

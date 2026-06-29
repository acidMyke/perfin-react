import { useAppForm } from '#client/components/Form';
import { PageHeader } from '#client/components/PageHeader';
import { queryClient, trpc } from '#client/trpc';
import { formOptions } from '@tanstack/react-form';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/expenses/agent/create')({
  component: RouteComponent,
  loader: () => Promise.all([queryClient.ensureQueryData(trpc.expense.loadOptions.queryOptions())]),
});

type AgentImageFile = {
  kind: string;
  file: Blob;
};

const agentCreateFormOptions = formOptions({
  defaultValues: {
    uploadedImages: [] as AgentImageFile[],
    customInstruction: '',
    accountIds: [] as string[],
    categoryIds: [] as string[],
  },
});

function RouteComponent() {
  const { data: options } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const { accountOptions, categoryOptions } = options;

  const form = useAppForm(agentCreateFormOptions);

  return (
    <div className='mx-auto max-w-lg px-2'>
      <PageHeader title='Expense agent' />

      <form.AppForm>
        <div className='mt-4 flex flex-wrap gap-4'>
          <form.AppField name='accountIds'>
            {({ MultiSelectBox }) => <MultiSelectBox label='Account' options={accountOptions} containerCn='flex-1' />}
          </form.AppField>
          <form.AppField name='categoryIds'>
            {({ MultiSelectBox }) => <MultiSelectBox label='Category' options={categoryOptions} containerCn='flex-1' />}
          </form.AppField>
        </div>
      </form.AppForm>
    </div>
  );
}

import { useAppForm, type Option } from '#client/components/Form';
import { ImagePreview } from '#client/components/ImagePreview';
import { PageHeader } from '#client/components/PageHeader';
import { queryClient, trpc } from '#client/trpc';
import { generateId } from '#client/utils';
import { formOptions } from '@tanstack/react-form';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/expenses/agent/create')({
  component: RouteComponent,
  loader: () => Promise.all([queryClient.ensureQueryData(trpc.expense.loadOptions.queryOptions())]),
});

type AgentImageFile = {
  id: string;
  kind: undefined | Option;
  file?: Blob;
};

const imageKind = ['recipe', 'statement'];
const imageKindOptions: Option[] = imageKind.map(value => ({
label: value.charAt(0).toUpperCase() + value.slice(1),
value,
}));

const agentCreateFormOptions = formOptions({
  defaultValues: {
    uploadedImages: [] as AgentImageFile[],
    customInstruction: '',
    accountIds: [] as string[],
    categoryIds: [] as string[],
  },
  validators: {
    onChange: ({ value }) => {
      if (value.uploadedImages.length === 0) {
        return { form: 'Must include at least 1 image' };
      }
    },
  },
});

function RouteComponent() {
  const { data: options } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const { accountOptions, categoryOptions } = options;

  const form = useAppForm(agentCreateFormOptions);

  return (
    <div className='mx-auto max-w-lg px-2'>
      <PageHeader title='Expense agent' />
      <div className='space-y-2'>
        <div className='flex flex-row gap-2'>
          <input
            type='file'
            className='file-input file-input-ghost'
            onChange={e => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) {
                form.setFieldValue('uploadedImages', cur => [
                  ...cur,
                  ...files.map(file => ({ id: generateId(), kind: undefined, file })),
                ]);
              }
            }}
          />
        </div>
        <form.AppForm>
          <form.Field name='uploadedImages' mode='array'>
            {field =>
              field.state.value.map(({ id }, idx) => (
<form.AppField key={id} name={`uploadedImages[${idx}].kind`}>
                  {({ ComboBox, state }) => (
                <div className='collapse-arrow border-base-300 bg-base-100 collapse w-full border'>
                  <input type='radio' name='open-file' />
                  <div className='collapse-title font-medium'>
                    {state.value?.label ?? 'Not set'} • Image #{idx + 1}
                  </div>
                  <div className='collapse-content space-y-2'>
<ComboBox label='Kind' options={imageKindOptions} />
                        <ImagePreview blob={file} />
                                    </div>
                </div>
)}
                </form.AppField>
              ))
            }
          </form.Field>

          <div className='mt-4 flex flex-wrap gap-4'>
            <form.AppField name='accountIds'>
              {({ MultiSelectBox }) => <MultiSelectBox label='Account' options={accountOptions} containerCn='flex-1' />}
            </form.AppField>
            <form.AppField name='categoryIds'>
              {({ MultiSelectBox }) => (
                <MultiSelectBox label='Category' options={categoryOptions} containerCn='flex-1' />
              )}
            </form.AppField>
          </div>
        </form.AppForm>
      </div>
    </div>
  );
}

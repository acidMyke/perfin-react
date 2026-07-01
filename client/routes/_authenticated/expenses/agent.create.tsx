import { useAppForm, type Option } from '#client/components/Form';
import { ImagePreview, ImagePreviewSkeleton } from '#client/components/ImagePreview';
import { PageHeader } from '#client/components/PageHeader';
import { queryClient, trpc, withCsrf } from '#client/trpc';
import { generateId } from '#client/utils';
import { formOptions } from '@tanstack/react-form';
import { useSuspenseQuery, useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import imageCompression, { type Options as BicOptions } from 'browser-image-compression';
import bicLibUrl from 'browser-image-compression/dist/browser-image-compression.js?url';

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
      if (!value.uploadedImages.some(({ file }) => !!file)) {
        return { form: 'Must include at least 1 image' };
      }
    },
  },
});

type AgentCreateFormData = typeof agentCreateFormOptions.defaultValues;

const bicOptions: BicOptions = {
  useWebWorker: true,
  libURL: bicLibUrl,
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1024,
};

function RouteComponent() {
  const { data: options } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const { accountOptions, categoryOptions } = options;
  const compressImagesMutation = useMutation({
    mutationFn: (files: File[]) => {
      const imgCpsPrs: Promise<{ id: string; file: File | undefined }>[] = [];
      const newUploadedFile: AgentImageFile[] = [];
      for (const file of files) {
        const id = generateId();
        imgCpsPrs.push(
          imageCompression(file, bicOptions)
            .then(cFile => ({ id, file: cFile instanceof Blob ? cFile : undefined }))
            .catch(() => ({ id, file: undefined })),
        );
        newUploadedFile.push({ id, kind: undefined });
      }
      form.setFieldValue('uploadedImages', cur => [...cur, ...newUploadedFile]);
      return Promise.all(imgCpsPrs);
    },
    onSuccess: compressedImgs => {
      form.setFieldValue('uploadedImages', cur =>
        cur
          .map(info => (info.file ? info : { ...info, file: compressedImgs.find(({ id }) => id === info.id)?.file }))
          .filter(({ file }) => !!file),
      );
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: AgentCreateFormData) => {
      const { accountIds, categoryIds, uploadedImages, customInstruction } = data;
      const formData = new FormData();
      let atLeastOneFile = false;
      accountIds.forEach(id => formData.append('accountIds', id));
      categoryIds.forEach(id => formData.append('categoryIds', id));
      uploadedImages.forEach(({ kind, file }, index) => {
        if (!file) return;
        atLeastOneFile = true;
        formData.append(`uploadedImages.${index}.kind`, kind?.value ?? '');
        formData.append(`uploadedImages.${index}.image`, file);
      });
      if (customInstruction) {
        formData.append('customInstruction', customInstruction);
      }

      if (atLeastOneFile) {
        const response = await fetch('/expenses/agent-create', { method: 'POST', body: formData, headers: withCsrf() });
        if (!response.ok) throw new Error('Submission failed');
        return response.json();
      }
    },
  });
  const form = useAppForm({ ...agentCreateFormOptions, onSubmit: ({ value }) => submitMutation.mutateAsync(value) });

  return (
    <div className='mx-auto max-w-lg px-2'>
      <PageHeader title='Expense agent' />
      <div className='space-y-2'>
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
                        <form.AppField name={`uploadedImages[${idx}].file`}>
                          {({ state: { value } }) => (value ? <ImagePreview blob={value} /> : <ImagePreviewSkeleton />)}
                        </form.AppField>
                        <button className='btn btn-error' onClick={() => field.removeValue(idx)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </form.AppField>
              ))
            }
          </form.Field>

          <input
            type='file'
            multiple
            accept='image/*'
            className='file-input file-input-ghost file-input-xl w-full'
            disabled={compressImagesMutation.isPending || submitMutation.isPending}
            onChange={e => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) compressImagesMutation.mutate(files);
            }}
          />

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

          <form.SubmitButton disabled={compressImagesMutation.isPending} label='Submit' />
        </form.AppForm>
      </div>
    </div>
  );
}

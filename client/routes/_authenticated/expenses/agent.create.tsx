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
import { load, type Tags } from 'exifreader';

export const Route = createFileRoute('/_authenticated/expenses/agent/create')({
  component: RouteComponent,
  loader: () => Promise.all([queryClient.ensureQueryData(trpc.expense.loadOptions.queryOptions())]),
});

type AgentImageFile = {
  id: string;
  kind: undefined | Option;
  file?: Blob;
  description?: string | null;
  tags?: Tags;
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
    accountIds: [] as Option[],
    categoryIds: [] as Option[],
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

async function processImageFile(id: string, file: File) {
  const [compressionResult, exifResult] = await Promise.allSettled([imageCompression(file, bicOptions), load(file)]);
  return {
    id,
    file:
      compressionResult.status === 'fulfilled' && compressionResult.value instanceof Blob
        ? compressionResult.value
        : undefined,
    tags: exifResult.status === 'fulfilled' ? exifResult.value : undefined,
  };
}

function RouteComponent() {
  const { data: options } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const { accountOptions, categoryOptions } = options;
  const compressImagesMutation = useMutation({
    mutationFn: (files: File[]) => {
      const promises: ReturnType<typeof processImageFile>[] = [];
      const newUploadedFile: AgentImageFile[] = [];
      for (const file of files) {
        const id = generateId();
        promises.push(processImageFile(id, file));
        newUploadedFile.push({ id, kind: undefined });
      }
      form.setFieldValue('uploadedImages', cur => [...cur, ...newUploadedFile]);
      return Promise.all(promises);
    },
    onSuccess: compressedImgs => {
      form.setFieldValue('uploadedImages', cur =>
        cur
          .map(info => {
            if (info.file) return info;
            const result = compressedImgs.find(({ id }) => id === info.id);
            if (!result || !result.file) return { ...info, file: null! };
            return { ...info, file: result.file!, tags: result.tags };
          })
          .filter(({ file }) => !!file),
      );
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: AgentCreateFormData) => {
      const { accountIds, categoryIds, uploadedImages, customInstruction } = data;
      const formData = new FormData();
      let atLeastOneFile = false;
      accountIds.forEach(({ value }) => formData.append('accountIds', value));
      categoryIds.forEach(({ value }) => formData.append('categoryIds', value));
      uploadedImages.forEach(({ kind, file, tags }, index) => {
        if (!file) return;
        atLeastOneFile = true;
        if (kind?.value) formData.append(`uploadedImages.${index}.kind`, kind.value);
        if (tags) formData.append(`uploadedImages.${index}.metadata`, JSON.stringify(tags));
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
    <div className='mx-auto max-w-lg px-2 pb-20'>
      <PageHeader title='Expense agent create' showBackButton />
      <div className='mt-4 space-y-2'>
        <form.AppForm>
          <form.Field name='uploadedImages' mode='array'>
            {field =>
              field.state.value.map(({ id }, idx) => (
                <form.AppField key={id} name={`uploadedImages[${idx}].kind`}>
                  {({ ComboBox, state }) => (
                    <div className='collapse-arrow border-base-300 bg-base-100 collapse w-full border'>
                      <input type='checkbox' name='open-file' />
                      <div className='collapse-title font-medium'>
                        {state.value?.label ?? 'Not set'} • Image #{idx + 1}
                      </div>
                      <div className='collapse-content space-y-2'>
                        <ComboBox label='Kind' options={imageKindOptions} />
                        <form.AppField name={`uploadedImages[${idx}].file`}>
                          {({ state: { value } }) => (value ? <ImagePreview blob={value} /> : <ImagePreviewSkeleton />)}
                        </form.AppField>
                        <form.AppField name={`uploadedImages[${idx}].description`}>
                          {({ TextInput }) => <TextInput type='text' label='Description' nullIfEmpty />}
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
            className='file-input file-input-ghost file-input-lg w-full'
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

          <form.AppField name='customInstruction'>
            {({ TextArea }) => <TextArea textareaCn='textarea-lg' label='Instructions' nullIfEmpty />}
          </form.AppField>

          <form.SubmitButton disabled={compressImagesMutation.isPending} label='Submit' />
        </form.AppForm>
      </div>
    </div>
  );
}

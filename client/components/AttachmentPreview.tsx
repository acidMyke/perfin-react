import { useEffect, useState } from 'react';
import { isLocalAttachment, type Attachment } from '#client/lib/attachment';

type AttachmentPreviewProps = {
  attachment: Attachment;
};

export function AttachmentPreview({ attachment }: AttachmentPreviewProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const isLocal = isLocalAttachment(attachment);

  useEffect(() => {
    if (!isLocal) {
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(attachment.file);
    setObjectUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [attachment]);

  const url = isLocal ? objectUrl : attachment.url;

  if (!url) {
    return (
      <div className='text-base-content/60 flex min-h-48 items-center justify-center text-sm'>Loading preview...</div>
    );
  }

  if (attachment.mimeType?.startsWith('image/')) {
    return (
      <div className='flex items-center justify-center'>
        <img src={url} alt={getAttachmentName(attachment)} className='max-h-[70vh] max-w-full object-contain' />
      </div>
    );
  }

  if (attachment.mimeType === 'application/pdf') {
    return <iframe src={url} title={getAttachmentName(attachment)} className='h-[70vh] w-full' />;
  }

  return (
    <div className='flex min-h-48 flex-col items-center justify-center gap-3 text-center'>
      <p className='font-medium'>Preview unavailable</p>

      <a href={url + '?download=true'} target='_blank' rel='noopener noreferrer' className='btn btn-primary btn-sm'>
        Download
      </a>

      <a href={url} target='_blank' rel='noopener noreferrer' className='btn btn-primary btn-sm'>
        Open file
      </a>
    </div>
  );
}

function getAttachmentName(attachment: Attachment) {
  return attachment.type === 'local' ? attachment.file.name : attachment.name;
}

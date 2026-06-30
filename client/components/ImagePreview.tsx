import { useState, useEffect } from 'react';

export function ImagePreview({ blob, alt = 'preview' }: { blob: Blob; alt?: string }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!url) {
    return <ImagePreviewSkeleton />;
  }

  return <img src={url} alt={alt} className='max-h-72 w-full rounded-lg object-contain' />;
}

export function ImagePreviewSkeleton() {
  return <div className='skeleton h-72 max-h-72 w-full rounded-lg' />;
}

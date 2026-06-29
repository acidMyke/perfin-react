import { useState, useEffect } from 'react';

export function ImagePreview({ blob, alt = 'preview' }: { blob: Blob; alt?: string }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return <img src={url} alt={alt} className='max-h-72 w-full rounded-lg border object-contain' />;
}

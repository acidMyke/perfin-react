import { useCanGoBack, useRouter } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

type PageHeaderProp = {
  showBackButton?: boolean;
  title?: string;
};

export function PageHeader({ showBackButton, title }: PageHeaderProp) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  return (
    <>
      {showBackButton && (
        <button className='btn btn-ghost fixed' disabled={!canGoBack} onClick={_ => router.history.back()}>
          <ArrowLeft />
        </button>
      )}
      {title && <h1 className='mb-2 text-center text-3xl font-black'>{title}</h1>}
    </>
  );
}

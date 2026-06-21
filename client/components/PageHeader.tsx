import { createLink, useCanGoBack, useRouter } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';

type PageHeaderProp = {
  title: string;
  children?: ReactNode;
  showBackButton?: boolean;
};

const LeftLink = createLink(
  forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(({ children, ...props }, ref) => {
    return (
      <div className='absolute left-0 flex items-center'>
        <a ref={ref} {...props}>
          {children ?? <ArrowLeft />}
        </a>
      </div>
    );
  }),
);

const RightLink = createLink(
  forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(({ children, ...props }, ref) => {
    return (
      <div className='absolute right-0 flex items-center'>
        <a ref={ref} {...props}>
          {children ?? <ArrowRight />}
        </a>
      </div>
    );
  }),
);

const LeftSection = ({ children }: { children: ReactNode }) => (
  <div className='absolute left-0 flex items-center'>{children}</div>
);

const RightSection = ({ children }: { children: ReactNode }) => (
  <div className='absolute right-0 flex items-center'>{children}</div>
);

const Main = ({ title, showBackButton, children }: PageHeaderProp) => {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  return (
    <header className='relative mb-2 flex items-center justify-center py-2'>
      <h1 className='m-0 text-center text-3xl font-black'>{title}</h1>

      {showBackButton && (
        <button
          className='absolute left-0 flex items-center'
          disabled={!canGoBack}
          onClick={_ => router.history.back()}
        >
          <ArrowLeft />
        </button>
      )}

      {children}
    </header>
  );
};

export const PageHeader = Object.assign(Main, { LeftLink, RightLink, LeftSection, RightSection });

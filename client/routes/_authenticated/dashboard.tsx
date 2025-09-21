import { createFileRoute } from '@tanstack/react-router';
import { whoamiQueryOptions } from '../../queryOptions';
import { useSuspenseQuery } from '@tanstack/react-query';
import { queryClient, trpc } from '../../trpc';
import { PageHeader } from '../../components/PageHeader';
import { cn } from '../../components/Form';
import { MoveRight, TrendingDown, TrendingUp, type LucideProps } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: RouteComponent,
  loader: () => {
    return Promise.all([queryClient.ensureQueryData(trpc.dashboard.getInsights.queryOptions())]);
  },
});

function RouteComponent() {
  const currencyFormatter = Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
  });
  const { data: insightData } = useSuspenseQuery(trpc.dashboard.getInsights.queryOptions());

  return (
    <div className='mx-auto flex max-w-md flex-col'>
      <PageHeader title='Overview' />
      <h2 className='mb-2 text-xl'>You have spent</h2>

      <div className='stats pl-4 shadow'>
        <div className='stat w-full'>
          <div className='state-title'>Last 7 days</div>
          <div className='stat-value text-primary'>{currencyFormatter.format(insightData.lastSevenDays)}</div>
          <div className={cn(`stat-desc`, { 'text-error': insightData.percentSevenDays > 0.2 })}>
            <TrendIcon className='mr-2 inline-block' diff={insightData.percentSevenDays} />
            <span>{currencyFormatter.format(insightData.diffSevenDays)} </span>
            <span>({(insightData.percentSevenDays * 100).toFixed(2)}%)</span>
          </div>
        </div>
        <div className='stat w-full'>
          <div className='state-title'>Last 14 days</div>
          <div className='stat-value text-primary'>{currencyFormatter.format(insightData.lastFourteenDays)}</div>
          <div className={cn(`stat-desc`, { 'text-error': insightData.percentFourteenDays > 0.2 })}>
            <TrendIcon className='mr-2 inline-block' diff={insightData.percentFourteenDays} />
            <span>{currencyFormatter.format(insightData.diffFourteenDays)} </span>
            <span>({(insightData.percentFourteenDays * 100).toFixed(2)}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrendIcon({ diff, invert = false, ...rest }: { diff: number; invert?: boolean } & LucideProps) {
  if (diff > 0 !== invert) {
    return <TrendingUp {...rest} />;
  } else if (diff < 0 !== invert) {
    return <TrendingDown {...rest} />;
  } else {
    return <MoveRight {...rest} />;
  }
}

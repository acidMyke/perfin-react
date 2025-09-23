import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { queryClient, trpc, type RouterInputs } from '../../trpc';
import { PageHeader } from '../../components/PageHeader';
import { cn } from '../../components/Form';
import { ChevronDown, MoveRight, TrendingDown, TrendingUp, type LucideProps } from 'lucide-react';
import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from 'recharts';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: RouteComponent,
  loader: () => {
    return Promise.all([
      queryClient.ensureQueryData(trpc.dashboard.getInsights.queryOptions()),
      queryClient.ensureQueryData(trpc.dashboard.getTrend.queryOptions({ interval: 'days' })),
    ]);
  },
});

const currencyFormatter = Intl.NumberFormat('en-SG', {
  style: 'currency',
  currency: 'SGD',
});

function RouteComponent() {
  return (
    <div className='mx-auto flex max-w-md flex-col'>
      <PageHeader title='Overview' />
      <InsightsSection />
      <TrendLineSection />
    </div>
  );
}

function InsightsSection() {
  const { data } = useSuspenseQuery(trpc.dashboard.getInsights.queryOptions());

  return (
    <>
      <h2 className='mb-2 text-xl'>You have spent</h2>

      <div className='stats pl-4 shadow'>
        <div className='stat w-full'>
          <div className='state-title'>Last 7 days</div>
          <div className='stat-value text-primary'>{currencyFormatter.format(data.lastSevenDays)}</div>
          <div className={cn(`stat-desc`, { 'text-error': data.percentSevenDays > 0.2 })}>
            <TrendIcon className='mr-2 inline-block' diff={data.percentSevenDays} />
            <span>{currencyFormatter.format(data.diffSevenDays)} </span>
            <span>({(data.percentSevenDays * 100).toFixed(2)}%)</span>
          </div>
        </div>
        <div className='stat w-full'>
          <div className='state-title'>Last 14 days</div>
          <div className='stat-value text-primary'>{currencyFormatter.format(data.lastFourteenDays)}</div>
          <div className={cn(`stat-desc`, { 'text-error': data.percentFourteenDays > 0.2 })}>
            <TrendIcon className='mr-2 inline-block' diff={data.percentFourteenDays} />
            <span>{currencyFormatter.format(data.diffFourteenDays)} </span>
            <span>({(data.percentFourteenDays * 100).toFixed(2)}%)</span>
          </div>
        </div>
      </div>
    </>
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

function TrendLineSection() {
  const [interval, setInterval] = useState<RouterInputs['dashboard']['getTrend']['interval']>('days');
  const {
    data: { duration, trendData },
  } = useSuspenseQuery(trpc.dashboard.getTrend.queryOptions({ interval }));

  return (
    <>
      <h2 className='mt-4 mb-2 text-xl'>
        Over the past {duration}
        <div className='dropdown ml-2'>
          <div tabIndex={0} role='button' className='btn'>
            {interval}
            <ChevronDown />
          </div>
          <ul tabIndex={0} className='menu dropdown-content bg-base-100 rounded-box z-1 w-36 p-2 shadow-sm'>
            <li>
              <button onClick={() => setInterval('days')}>days</button>
            </li>
            <li>
              <button onClick={() => setInterval('weeks')}>weeks</button>
            </li>
            <li>
              <button onClick={() => setInterval('months')}>months</button>
            </li>
          </ul>
        </div>
      </h2>

      <LineChart data={trendData} width={440} height={320}>
        <CartesianGrid />
        <XAxis dataKey='tick' />
        <YAxis />
        <Legend />
        <Line type='linear' stroke='#51a2ff' dataKey='amount' name='Amount' />
      </LineChart>
    </>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { queryClient, trpc, type RouterInputs } from '../../trpc';
import { PageHeader } from '../../components/PageHeader';
import { cn } from '../../components/Form';
import { ChevronDown, MoveRight, TrendingDown, TrendingUp, type LucideProps } from 'lucide-react';
import { Suspense, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from 'recharts';
import { currencyNumberFormat } from '../../utils';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: RouteComponent,
  loader: () => {
    return Promise.all([
      queryClient.ensureQueryData(trpc.dashboard.getInsights.queryOptions()),
      queryClient.ensureQueryData(trpc.dashboard.getTrend.queryOptions({ duration: 28, interval: 'days' })),
    ]);
  },
  pendingComponent: PendingComponent,
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

const statTitles = {
  sevenDays: 'Last 7 days',
  fourteenDays: 'Last 14 days',
};

const statKeys = ['sevenDays', 'fourteenDays'] as const;

function InsightsSection() {
  const { data } = useSuspenseQuery(trpc.dashboard.getInsights.queryOptions());

  return (
    <>
      <h2 className='mb-2 text-xl'>You have spent</h2>

      <div className='stats pl-4 shadow'>
        {statKeys.map(key => {
          const { current, previous, diff, percentChange } = data[key];
          return (
            <div key={key} className='stat'>
              <div className='stat-title'>{statTitles[key]}</div>
              {current.count > 0 ? (
                <div className='stat-value text-primary'>{currencyNumberFormat.format(current.sum)}</div>
              ) : (
                <div className='stat-value text-primary'>N/A</div>
              )}
              {previous.count > 0 ? (
                <div className={cn(`stat-desc`, { 'text-error': percentChange > 0.2 })}>
                  <TrendIcon className='mr-2 inline-block' diff={percentChange} />
                  <span>{currencyNumberFormat.format(diff)} </span>
                  <span>({(percentChange * 100).toFixed(2)}%)</span>
                </div>
              ) : (
                <div className='stat-desc'> Test </div>
              )}
            </div>
          );
        })}
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
  const [{ duration, interval }, setTrendLineOption] = useState<RouterInputs['dashboard']['getTrend']>({
    duration: 28,
    interval: 'days',
  });

  return (
    <>
      <h2 className='mt-4 mb-2 text-xl'>
        Over the past
        <div className='dropdown ml-2'>
          <div tabIndex={0} role='button' className='btn'>
            {duration} {interval}
            <ChevronDown />
          </div>
          <ul tabIndex={0} className='menu dropdown-content bg-base-100 rounded-box z-1 w-36 p-2 shadow-sm'>
            <li>
              <button onClick={() => setTrendLineOption({ interval: 'days', duration: 28 })}>28 days</button>
            </li>
            <li>
              <button onClick={() => setTrendLineOption({ interval: 'weeks', duration: 14 })}>14 weeks</button>
            </li>
            <li>
              <button onClick={() => setTrendLineOption({ interval: 'months', duration: 6 })}>6 months</button>
            </li>
          </ul>
        </div>
      </h2>
      <Suspense fallback={<div className='skeleton h-80 w-110' />}>
        <DashboardChart interval={interval} duration={duration} />
      </Suspense>
    </>
  );
}

function DashboardChart({ duration, interval }: RouterInputs['dashboard']['getTrend']) {
  const {
    data: { trendData },
  } = useSuspenseQuery(trpc.dashboard.getTrend.queryOptions({ duration, interval }));

  return (
    <LineChart data={trendData} width={440} height={320}>
      <CartesianGrid />
      <XAxis dataKey='tick' />
      <YAxis />
      <Legend />
      <Line type='linear' stroke='#51a2ff' dataKey='amount' name='Amount' />
    </LineChart>
  );
}

function PendingComponent() {
  return (
    <div className='mx-auto flex max-w-md flex-col'>
      <PageHeader title='Overview' />
      <h2 className='mb-2 text-xl'>You have spent</h2>
      <div className='stats pl-4 shadow'>
        {statKeys.map(key => (
          <div key={key} className='stat'>
            <div className='stat-title'>{statTitles[key]}</div>
            <div className='stat-value text-primary skeleton mt-4 mb-2 h-8 w-full'></div>
            <div className='stat-desc skeleton h-4'></div>
          </div>
        ))}
      </div>
      <h2 className='mt-4 mb-2 text-xl'>Over the past</h2>
      <div className='skeleton h-80 w-110' />
    </div>
  );
}

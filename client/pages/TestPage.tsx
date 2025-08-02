import { useQuery } from '@tanstack/react-query';
import { trpc } from '../trpc';

function TestPage() {
  const testQuery = useQuery(trpc.testapi.queryOptions({ name: 'Dolphin' }));

  return <div>{testQuery.data}</div>;
}

export default TestPage;

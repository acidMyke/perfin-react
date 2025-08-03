import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { trpc } from '../trpc';
import { useEffect } from 'react';

export const Route = createFileRoute('/test')({
  component: RouteComponent,
});

function RouteComponent() {
  const { mutate: signUp } = useMutation(trpc.session.signUp.mutationOptions());
  const { mutate: signIn } = useMutation(trpc.session.signIn.mutationOptions());
  const { mutate: testAuthApi } = useMutation(trpc.testauthapi.mutationOptions());

  useEffect(() => {
    // @ts-ignore
    window.signUp = signUp;
    // @ts-ignore
    window.signIn = signIn;
    // @ts-ignore
    window.testAuthApi = testAuthApi;
  }, [signUp, signIn]);

  return <div></div>;
}

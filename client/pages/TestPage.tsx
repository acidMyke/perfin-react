import { useMutation, useQuery } from '@tanstack/react-query';
import { trpc } from '../trpc';
import { useEffect } from 'react';

function TestPage() {
  const { mutate: signUp } = useMutation(trpc.session.signUp.mutationOptions());
  const { mutate: signIn } = useMutation(trpc.session.signIn.mutationOptions());

  useEffect(() => {
    // @ts-ignore
    window.signUp = signUp;
    // @ts-ignore
    window.signIn = signIn;
  }, [signUp, signIn]);

  return <div></div>;
}

export default TestPage;

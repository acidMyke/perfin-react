import { useRef } from 'react';
import { useExpenseForm } from '.';
import { useBlocker } from '@tanstack/react-router';

type DirtyFormBlockModelProp = {
  mainRouteId: string;
};

export function DirtyFormBlockModel({ mainRouteId }: DirtyFormBlockModelProp) {
  const form = useExpenseForm();
  const confirmationModelRef = useRef<HTMLDialogElement>(null);

  const { proceed } = useBlocker({
    withResolver: true,
    enableBeforeUnload: true,
    shouldBlockFn: ({ next }) => {
      if (!form.state.isDirty || form.state.isSubmitSuccessful) return false;
      const isNavigateToChild = next.routeId.startsWith(mainRouteId);
      const isNextViewPage = next.routeId.endsWith('view');
      const shouldBlock = !isNavigateToChild || isNextViewPage;
      if (shouldBlock) {
        confirmationModelRef.current?.showModal();
      }
      return shouldBlock;
    },
  });

  return (
    <dialog className='modal' ref={confirmationModelRef}>
      <div className='modal-box'>
        <h3 className='text-lg font-bold'>You have unsaved changes. Are you sure you want to leave this page?</h3>
        <p>Your changes will be lost.</p>
        <div className='modal-action'>
          <button className='btn btn-ghost' onClick={() => confirmationModelRef.current?.close()}>
            Stay Here
          </button>
          <button
            className='btn btn-error'
            onClick={() => (form.reset(), confirmationModelRef.current?.close(), proceed?.())}
          >
            Leave Page
          </button>
        </div>
      </div>
    </dialog>
  );
}

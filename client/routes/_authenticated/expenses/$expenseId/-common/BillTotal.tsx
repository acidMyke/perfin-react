import { Fragment } from 'react';
import { cn } from '#client/components/Form';
import { formatBps, formatCents } from '#client/utils';
import { TriangleAlert } from 'lucide-react';
import { formatAdjustmentName, useExpenseForm } from '.';

type BillTotalProps = {
  className?: string;
  isView?: boolean;
};

export function BillTotal({ className, isView }: BillTotalProps) {
  const form = useExpenseForm();

  return (
    <form.Subscribe
      selector={state =>
        [
          state.values.ui.calculateResult.grossTotalCents,
          state.values.ui.calculateResult.netTotalCents,
          state.values.amountCents,
          state.values.adjustments,
          state.values.ui.calculateResult.adjustmentResults,
        ] as const
      }
    >
      {([grossTotalCents, netTotalCents, amountCents, adjustments, adjustmentResults]) => (
        <>
          {isView && amountCents !== netTotalCents && (
            <div role='alert' className='alert alert-warning'>
              <TriangleAlert />
              <span>Stored total is out of sync. Please edit & save.</span>
            </div>
          )}
          <div
            className={cn(
              'border-t-base-content/20 grid auto-cols-min grid-flow-row grid-cols-1 border-t pt-4 *:even:text-right',
              className,
            )}
          >
            {grossTotalCents !== netTotalCents && (
              <>
                <span className='col-start-1 row-start-1 text-lg font-bold'>Subtotal:</span>
                <span className='col-start-2 row-start-1 text-lg'>{formatCents(grossTotalCents)}</span>
                {isView &&
                  adjustments.map((adj, adjIdx) => {
                    const { id: adjId, name, rateBps, expenseItemId } = adj;
                    const adjustmentResult = adjustmentResults[adjIdx][1];
                    if (!adjustmentResult) {
                      return undefined;
                    }
                    return (
                      <Fragment key={adjId}>
                        <div className='col-start-1 flex pl-4 font-thin'>
                          <span className='grow'>{formatAdjustmentName(name)}</span>
                          {!expenseItemId && rateBps && <span>({formatBps(rateBps)})</span>}
                        </div>
                        <span className='col-start-2'>{formatCents(adjustmentResult?.amountCents)}</span>
                      </Fragment>
                    );
                  })}
              </>
            )}

            <span className='col-start-1 text-2xl font-bold'>Total:</span>
            <span className='col-start-2 text-2xl'>{formatCents(netTotalCents)}</span>
          </div>
        </>
      )}
    </form.Subscribe>
  );
}

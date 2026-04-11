import { cn } from '#client/components/Form';
import { formatCents } from '#client/utils';
import { useExpenseForm } from '.';

type BillTotalProps = {
  className?: string;
};

export function BillTotal({ className }: BillTotalProps) {
  const form = useExpenseForm();

  return (
    <form.Subscribe
      selector={state => [
        state.values.ui.calculateResult.grossTotalCents,
        state.values.ui.calculateResult.netTotalCents,
      ]}
    >
      {([grossTotalCents, netTotalCents]) => (
        <div
          className={cn(
            'border-t-base-content/20 grid auto-cols-min grid-cols-1 border-t pt-4 *:odd:font-bold *:even:text-right',
            className,
          )}
        >
          {grossTotalCents !== netTotalCents && (
            <>
              <span className='row-start-1'>Subtotal:</span>
              <span className='row-start-1'>{formatCents(grossTotalCents)}</span>
            </>
          )}
          <span className='row-start-2 text-2xl'>Total:</span>
          <span className='row-start-2 text-2xl'>{formatCents(netTotalCents)}</span>
        </div>
      )}
    </form.Subscribe>
  );
}

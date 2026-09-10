import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import './TermHelp.css'

const glossary: Record<string, string> = {
  'Face value': 'The principal promised at maturity. A face value of 1,000 with a 5% coupon pays 50 each year, plus repayment of 1,000 at maturity.',
  'Coupon rate': 'Annual contractual interest as a percentage of face value. A 5% coupon on 1,000 pays 50 annually, regardless of the price you paid for the bond.',
  Maturity: 'Time remaining until the final payment and principal repayment. Five years with semi-annual coupons means ten payment dates. This model requires whole coupon periods.',
  'Coupon frequency': 'How often coupons are paid. A 50 annual coupon paid semi-annually produces two payments of 25 per year.',
  'Market yield': 'The annual effective return used to discount promised payments in this model. A higher required yield produces a lower bond price. At 5%, receiving 105 in one year is worth 100 today. Promised payments are assumed to be made.',
  'Present value': 'All future coupons and principal converted into their value today and added together. At a 5% annual yield, a payment of 105 in one year has a present value of 100.',
  'Modified duration': 'Approximate percentage price sensitivity to yield. A duration of 4.3 means a 1-percentage-point yield rise gives roughly a 4.3% price fall. This linear approximation is more accurate for small moves.',
  DV01: 'Approximate money lost per bond for a 1 bp rise in yield. One bp is 0.01 percentage points. A DV01 of 0.44 implies about 4.40 lost for a 10 bp rise, in the bond’s currency units. This app displays the positive sensitivity magnitude.',
  Convexity: 'Curvature of the price–yield relationship. It improves the duration estimate: relative price change ≈ −duration × Δy + ½ × convexity × Δy². Use decimal yield changes. Convexity itself is not a percentage return.',
  'Macaulay duration': 'Average time to receive payments, weighted by their present values. A five-year coupon bond can have a duration of 4.49 years because some cash arrives earlier. It is not the time to recover your investment.',
  Shock: 'A hypothetical yield change in basis points. +100 bp moves 4.5% to 5.5%. Here the same single yield is changed for all payment dates.',
  'Shocked yield': 'Original yield plus the scenario shock. For example, 4.5% plus 50 basis points equals 5.0%.',
  Price: 'The bond’s value recalculated using the shocked yield. Compare this with the original present value to find the scenario profit or loss.',
  'Exact P&L': 'Shocked price minus original price, from full cash-flow repricing within this model. A move from 1,024 to 982 produces a loss of 42. This is a scenario, not a forecast.',
  Duration: 'Estimated monetary P&L using modified duration only: −original price × modified duration × decimal yield change. This table column is a money amount, not years.',
  'Duration + convexity': 'Estimated monetary P&L using duration plus the curvature adjustment. Compare with Exact P&L to see how well the approximation matches full repricing.',
  'Yield shock profile': 'Shows hypothetical profit or loss as yield changes. The horizontal axis shows basis points; the vertical axis shows money gained or lost.',
  'Contractual cash flows': 'Scheduled, undiscounted coupons and principal repayment. A 1,000 bond paying 25 every six months has a final payment of 1,025.',
}

export function TermHelp({ term }: { term: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  if (!glossary[term]) return <>{term}</>
  return <span className="term-label">
    <span>{term}</span>
    <button type="button" className="term-help-button" aria-label={`Explain ${term}`}
      aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>?</button>
    {createPortal(<dialog ref={dialog} className="term-dialog" aria-labelledby={id}
      onClick={event => {
        if (event.target !== event.currentTarget) return
        const r = event.currentTarget.getBoundingClientRect()
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
          dialog.current?.close()
      }}>
      <div className="term-dialog-heading"><h2 id={id}>{term}</h2>
        <button type="button" aria-label="Close explanation" onClick={() => dialog.current?.close()}>×</button>
      </div>
      <p>{glossary[term]}</p>
    </dialog>, document.body)}
  </span>
}
# Task 3 Report: Refine Step Flow and Bill Breakdown

## Implementation Summary

**File Changed:** [CheckoutModal.tsx](file:///Users/rithsila/Projects/Ai%20Cha%20Menu/apps/menu/src/components/CheckoutModal.tsx)

Implemented the checkout step workflow and pricing breakdown in the client application:
1. **Rearranged Step 1 (Fulfillment) View:**
   - Placed the order type selector (Pickup vs Delivery) above the fulfillment options.
   - Conditionally rendered the branch selector (if Pickup) or delivery address textarea (if Delivery).
   - Styled Branch selection cards to look premium and native: `rounded-2xl border p-4 flex items-center justify-between transition-all` with custom active/focused states.
   - Styled Delivery Address textarea as a `rounded-2xl` input with appropriate font-size and a minimum height of 88px for a large tap target area.
2. **Refined Step 2 (Payment & Loyalty) View:**
   - Modified the Loyalty points discount toggle container to have a vertical touch target size of at least `44px` (`min-h-[44px]`).
   - Redesigned KHQR and Cash payment method choice cards to look native and premium using matching rounded-2xl styles and descriptions.
   - Implemented a clear **Pricing Breakdown** showing:
     - Subtotal (original cart total)
     - Loyalty Points Discount (if applicable)
     - Delivery Fee (standard $1.00 fee if Delivery)
     - Final Total (Subtotal - Discount + Delivery Fee)
3. **Structured Bottom Sticky Action Bar:**
   - Extracted action buttons from scrollable content into a sticky bar at the bottom: `sticky bottom-0 bg-tg-bg border-t border-tg-hint/10 w-full z-10`.
   - Formatted buttons for both steps: "Continue to Payment" for Step 1, and "Back" / "Pay [Final Total]" for Step 2.
4. **Aligned Client-Server Points Discount (Review Fix):**
   - Corrected client-side points discount logic to cover both subtotal and delivery fee: `Math.min(maxDiscountFromPoints, total + deliveryFee)`.
   - Adjusted the final total calculation: `total + deliveryFee - discountApplied`.
   - Updated the UI loyalty points hint/description text to reflect the inclusion of the delivery fee in the discount coverage.

## Verification Results

### Build Compilation
Verified that all packages build successfully:
```bash
npm run build
```
Result: All workspaces (`api`, `menu`, `staff`) compile cleanly with no errors.

### Workflow Verification
- **Delivery Mode:** Address textarea displays correctly. Leaving address empty blocks progress to Step 2.
- **Pickup Mode:** Shows list of branches and requires selection of a branch.
- **Loyalty Points Toggle:** Updates pricing breakdown and final total dynamically.
- **Payment Submission:** Correctly sends updated `totalAmount` (including delivery fee) and fulfillment details to the server. Simulated payment resolves successfully.
- **Points Discount Alignment:** Verified points discount calculation matches the backend logic by incorporating delivery fee into maximum coverage on the client.


# BuyWishOnline: Zendrop order handoff and tracking

This runbook describes the current custom-store flow in the ShippingWish monorepo. BuyWishOnline is the customer storefront; Zendrop remains the supplier. Do not describe this version as automatic Zendrop order submission.

## Current order lifecycle

1. **Customer checkout** — The API rechecks each product against Zendrop catalog data, calculates the amount server-side, creates a local order as `awaiting_payment`, then creates a Stripe Checkout Session.
2. **Payment confirmation** — Only the verified BuyWish Stripe webhook marks the order paid and changes fulfillment to `payment_confirmed_pending_supplier`. Checkout return-page data is not proof of payment.
3. **Supplier queue** — An authenticated admin-role user loads `GET /api/buywish/admin/orders`. It lists paid store orders with no linked Zendrop order ID.
4. **Place the supplier order** — Until Zendrop provides a documented custom-store order-create API contract, an authorized operator signs into Zendrop directly, finds the imported catalog product/variant, and checks quantity, customer shipping details, shipping method, and supplier charge before submitting. Confirm the order exists in Zendrop and record its real Zendrop order ID.
5. **Link once** — Submit that ID through `PATCH /api/buywish/admin/orders/:order_number/supplier`. The API accepts paid orders only, is idempotent for the same ID, refuses to overwrite a different linked ID, and refuses to attach one Zendrop ID to multiple local orders. A link changes fulfillment to `supplier_order_placed`.
6. **Customer tracking** — `GET /api/buywish/orders/track/:order_number` can retrieve Zendrop tracking events when an ID is linked. The public response omits the internal Zendrop order ID. Tracking lookup is best-effort; a temporary Zendrop failure does not erase the local order.

## Operator safeguards

- Check the local order number, product IDs/variants, quantities, paid state, complete shipping address, and customer contact before supplier submission.
- Search Zendrop for a possible existing order before retrying a timed-out/manual submission. Do not create a second supplier order just because the first request/result was ambiguous.
- Record the actual Zendrop order ID only after the order is visible in Zendrop. Do not fabricate IDs or tracking numbers.
- A linked supplier ID cannot be replaced by this API. If an incorrect ID is linked, stop and use an approved support/data-correction procedure that preserves an audit trail.
- Never use a browser-supplied status or Stripe return URL to mark payment as paid.
- The prior token-like credential committed in repository history must be treated as exposed. Revoke it at Zendrop; configure a new least-privilege secret in Vercel as `ZENDROP_API_KEY`. Never put the value in code, logs, issues, screenshots, or chat.
- Restrict product import, supplier queue, order linking, billing, and account-management routes to authorized BuyWish admins. Do not grant those permissions to partner/driver/customer accounts.

## Requirements before enabling automated supplier submission

Zendrop’s public MCP material does not define the exact create-order request for a custom-owned storefront. Do not guess the tool name, schema, or fulfillment/payment semantics. Before implementing auto-submit, obtain the Zendrop Direct API contract and sandbox procedure, then specify and verify:

- whether Zendrop accepts external store order IDs and supports an idempotency key;
- product/variant identifier, quantity, currency, destination, shipping method, and required customer fields;
- supplier charge/payment authorization and what state means the supplier has accepted the order;
- error, timeout, retry, cancellation, refund, stock/price-change, and duplicate-submission behavior;
- order status and tracking lookup/webhook fields and polling limits;
- token scopes, rotation/revocation, rate limits, and sandbox/test account support.

Automation should use a durable queue/outbox keyed by the local order number, persist request/response IDs without customer secrets, and only advance to supplier-placed after Zendrop confirms acceptance. Retries must be idempotent and customer notices must reflect the actual supplier state.

## Configuration and deployment

Required integrations are separate: Stripe API/webhook configuration for BuyWish payments; Zendrop API credentials for catalog and tracking; mail delivery for notices; and the database schema/migrations. The app does not create or reveal secrets. Configure/verify environment variables through the approved Vercel dashboard. PR previews are not production. Do not run the included NYC database migration against production without review and a backup plan.

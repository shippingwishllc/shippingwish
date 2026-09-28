# BuyWishOnline: catalog edit, order desk, and Zendrop handoff

BuyWishOnline is the customer storefront. Zendrop remains the supplier. The shop currently sells to the USA, Canada, and the United Kingdom.

## Catalog

An admin runs **Sync winning products** on `/admin`. Each batch asks Zendrop for trending products and a fixed set of category searches, then requests a shipping estimate for the USA, Canada, and the United Kingdom. A product is saved and imported into the Zendrop “my products” list only when all three countries have a quoted method and the fastest USA lane is 14 days or fewer. Products that fail that check are skipped. Nothing is invented when Zendrop does not return a quote.

The public catalog at `GET /api/buywish/products` serves that saved edit. If the edit is empty, the storefront falls back to the live Zendrop trending call.

## Orders

1. **Customer checkout** — The API rechecks each product, calculates the amount server-side, creates a local order as `awaiting_payment`, and opens Stripe Checkout. Stripe collects a shipping address in the USA, Canada, or the United Kingdom.
2. **Payment confirmation** — The signed BuyWish Stripe webhook marks the order paid. The return page also verifies the Stripe session on the server. A browser query string alone is not proof of payment.
3. **Zendrop send** — After payment, the server calls Zendrop `tools/list`. If that response includes a real order-creation tool whose required fields the paid order can fill, the order is sent once and the returned Zendrop order ID is saved. That is what makes the order appear in the Zendrop dashboard. If Zendrop does not publish such a tool, or the tool cannot accept the order, the order stays on the BuyWish order desk at `/admin` with status `manual_required`.
4. **Manual link** — Place the order in Zendrop, then paste the real Zendrop order ID on the desk. The link is paid-only, idempotent for the same ID, and cannot attach one Zendrop ID to two store orders.
5. **Customer tracking** — Signed-in customers see their orders at `/account` and in the BuyWishOnline mobile app. `GET /api/buywish/orders/track/:order_number` reads Zendrop tracking events when an ID is linked. The public response omits the internal Zendrop order ID.

## Will a website order show in Zendrop by itself?

Only after step 3 succeeds. Zendrop’s public MCP docs describe order fulfillment, but they do not publish the custom-store create-order schema. This app discovers the tool at runtime and refuses to guess a tool name. Until a token with `orders:write` advertises a matching tool, an operator still places the order in Zendrop and links the ID. A linked ID is what ties the store order to the Zendrop dashboard order.

## Order desk

`GET /api/buywish/admin/orders?scope=all` lists every store order. `scope=queue` (the default) still lists paid orders with no Zendrop ID. `POST /api/buywish/admin/orders/:order_number/push` retries the discovered Zendrop send. `PATCH /api/buywish/admin/orders/:order_number/supplier` links a real Zendrop order ID. The link accepts paid orders only, is idempotent for the same ID, refuses to overwrite a different linked ID, and refuses to attach one Zendrop ID to multiple local orders.

## Operator safeguards

- Check the local order number, product IDs/variants, quantities, paid state, complete shipping address, and customer contact before supplier submission.
- Search Zendrop for a possible existing order before retrying a timed-out/manual submission. Do not create a second supplier order just because the first request/result was ambiguous.
- Record the actual Zendrop order ID only after the order is visible in Zendrop. Do not fabricate IDs or tracking numbers.
- A linked supplier ID cannot be replaced by this API. If an incorrect ID is linked, stop and use an approved support/data-correction procedure that preserves an audit trail.
- Never use a browser-supplied status or Stripe return URL to mark payment as paid.
- The prior token-like credential committed in repository history must be treated as exposed. Revoke it at Zendrop; configure a new least-privilege secret in Vercel as `ZENDROP_API_KEY`. Never put the value in code, logs, issues, screenshots, or chat.
- Restrict product import, supplier queue, order linking, billing, and account-management routes to authorized BuyWish admins. Do not grant those permissions to partner/driver/customer accounts.

## Automated supplier submission

The server discovers order tools with `tools/list` and submits only when a tool name matches an order-creation action and every required schema field can be filled from the paid order. The store order number is sent as the idempotency key when the schema has that field. A response without an order ID does not mark the order as placed.

Still confirm with Zendrop before relying on this in production:



- whether Zendrop accepts external store order IDs and supports an idempotency key;
- product/variant identifier, quantity, currency, destination, shipping method, and required customer fields;
- supplier charge/payment authorization and what state means the supplier has accepted the order;
- error, timeout, retry, cancellation, refund, stock/price-change, and duplicate-submission behavior;
- order status and tracking lookup/webhook fields and polling limits;
- token scopes, rotation/revocation, rate limits, and sandbox/test account support.

The order desk is the queue. Status moves to `supplier_order_placed` only after Zendrop returns an order ID or an operator links one. Retries refuse to replace an existing ID. Customer notices should describe the local fulfillment status, not an assumed shipment.

## Configuration and deployment

Required integrations are separate: Stripe API/webhook configuration for BuyWish payments; Zendrop API credentials for catalog and tracking; mail delivery for notices; and the database schema/migrations. The app does not create or reveal secrets. Configure/verify environment variables through the approved Vercel dashboard. PR previews are not production. Do not run the included NYC database migration against production without review and a backup plan.

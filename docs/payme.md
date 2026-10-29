# Payme / ONLINE HARID

Core callback: `https://tube-mentor-production.up.railway.app/api/payme/webhook`.
Merchant: `6979166b1c0f5675c6c85bc5`. Cashbox account field: `order_id` (numeric).
The platform keeps its UUID order IDs; each checkout creates a separate numeric invoice.

## Preparation and sandbox

Set server-only Railway variables:
- `PAYME_MERCHANT_ID` — merchant above
- `PAYME_MODE=test`
- `PAYME_ENABLED=false`
- `PAYME_TEST_KEY` — existing cashbox test key, never commit it
- `PAYME_RETURN_ORIGIN=https://zamonaviy-talim.up.railway.app`
- `PAYME_RETURN_URL=https://zamonaviy-talim.up.railway.app/kabinet/hamyon`

The admin payment settings panel shows readiness, the callback address and the last 30 transactions.
Create a sandbox invoice in that panel. The returned numeric ID goes in `account.order_id`;
1,000 UZS is 100,000 tiyin. Open `https://test.paycom.uz`, enter the merchant ID and test key,
and exercise CheckPerformTransaction, CreateTransaction, PerformTransaction, CheckTransaction,
CancelTransaction and GetStatement. SetFiscalData preserves separate payment/refund fiscal receipts.
Set the cashbox callback only after the deployment is healthy.

Sandbox invoices cannot reference real orders and never change wallet balances or financial revenue.
Real checkout remains unavailable while the mode is test. Sandbox and real transaction IDs are namespaced.

## Production prerequisites

Confirm Payme has activated this cashbox. Configure its existing production key as `PAYME_KEY`,
and enter the actual, approved `PAYME_IKPU`, `PAYME_PACKAGE_CODE`, and `PAYME_VAT_PERCENT` supplied
by the business/accountant. Do not invent product or tax codes. Complete sandbox tests first.
Then choose `PAYME_MODE=live` and `PAYME_ENABLED=true`; the platform's existing paymentsEnabled
setting must also be on. Do not rotate modes while there are unresolved transactions: the callback
uses the current mode's key and namespace.

## Accounting and refunds

Prices and coin counts are frozen in the order. Only an authenticated PerformTransaction credits
coins, in the same database transaction as the Payme state change. Retries reuse the recorded response.
A unique active-transaction index and a payment-order credit key protect against concurrent duplicates.
A 12-hour unperformed transaction is cancelled with reason 4.

Payme-managed orders cannot be manually approved, manually refunded or supplied with uploaded receipts.
Refund through Payme Business. An unused paid lot is removed atomically with the full refund;
if any of that lot was spent, CancelTransaction returns -31007 without changing the wallet.
Turning PAYME_ENABLED off stops new checkouts but existing authenticated status/confirmation/refund calls
continue to work. Keep keys available until every outstanding transaction has been reconciled.

No keys, authorization headers, card numbers or raw RPC bodies are logged or exposed in admin DTOs.

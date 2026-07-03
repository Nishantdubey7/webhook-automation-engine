// Fires a handful of sample webhook deliveries at a running instance of the
// backend, to make it easy to watch the pipeline work end-to-end.
//
// Usage:
//   node sample-data/send-sample-webhooks.js
//   BASE_URL=http://localhost:3000 node sample-data/send-sample-webhooks.js
//
// Requires the seed script to have been run first (npm run seed in backend/).

const crypto = require('crypto');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ACME_SECRET = 'acme-shopify-secret';

function sign(secret, rawBody) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

async function post(path, body, { secret, deliveryId, eventType, source } = {}) {
  const raw = JSON.stringify(body);
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-webhook-signature'] = sign(secret, raw);
  if (deliveryId) headers['x-delivery-id'] = deliveryId;
  if (eventType) headers['x-event-type'] = eventType;

  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: raw });
  const json = await res.json().catch(() => ({}));
  console.log(`${res.status} ${path} source=${source ?? '?'} ->`, json);
  return res;
}

async function main() {
  console.log(`Sending sample webhooks to ${BASE_URL} ...\n`);

  // 1. A large Shopify order — should fire "Notify sales" + CRM sync rules.
  const bigOrder = {
    order_id: 'ORD-1001',
    customer_id: 'CUST-55',
    total_price: 1200,
    status: 'paid',
  };
  await post('/webhooks/acme/shopify', bigOrder, {
    secret: ACME_SECRET,
    deliveryId: 'evt-1001',
    eventType: 'order.created',
    source: 'shopify (acme)',
  });

  // 2. The SAME delivery re-sent (simulates the sender retrying because it
  //    didn't get an ack fast enough). Should be reported as a duplicate,
  //    and must NOT create a second job run.
  await post('/webhooks/acme/shopify', bigOrder, {
    secret: ACME_SECRET,
    deliveryId: 'evt-1001', // same delivery id => same dedupe key
    eventType: 'order.created',
    source: 'shopify (acme) [duplicate re-delivery]',
  });

  // 3. A small order — matches the "sync every paid order" rule but not the
  //    "large order" rule, and has a 30% simulated CRM failure so you can
  //    watch the replay flow.
  await post(
    '/webhooks/acme/shopify',
    { order_id: 'ORD-1002', customer_id: 'CUST-56', total_price: 40, status: 'paid' },
    { secret: ACME_SECRET, deliveryId: 'evt-1002', eventType: 'order.created', source: 'shopify (acme)' },
  );

  // 4. Bad signature — should be rejected with 401 and never reach Mongo.
  await post(
    '/webhooks/acme/shopify',
    { order_id: 'ORD-9999', total_price: 999, status: 'paid' },
    { secret: 'totally-wrong-secret', deliveryId: 'evt-bad-sig', eventType: 'order.created', source: 'shopify (acme) [BAD SIGNATURE]' },
  );

  // 5. Globex tenant, different source/eventType, no secret configured.
  await post(
    '/webhooks/globex/crm',
    { deal_id: 'DEAL-77', stage: 'won', amount: 25000 },
    { deliveryId: 'evt-2001', eventType: 'deal.updated', source: 'crm (globex)' },
  );

  console.log('\nDone. Check the UI (or GET /jobs, /webhooks with x-tenant-slug header) to see results.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

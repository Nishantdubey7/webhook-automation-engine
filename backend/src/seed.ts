/* eslint-disable no-console */
import mongoose from 'mongoose';
import { Tenant, TenantSchema } from './tenants/schemas/tenant.schema';
import { Rule, RuleSchema } from './rules/schemas/rule.schema';

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/webhook_engine';
  await mongoose.connect(uri);
  console.log(`Connected to ${uri}`);

  const TenantModel = mongoose.model(Tenant.name, TenantSchema);
  const RuleModel = mongoose.model(Rule.name, RuleSchema);

  await TenantModel.deleteMany({ slug: { $in: ['acme', 'globex'] } });
  await RuleModel.deleteMany({});

  const acme = await TenantModel.create({
    slug: 'acme',
    name: 'Acme Retail Co.',
    webhookSecrets: { shopify: 'acme-shopify-secret' },
  });

  const globex = await TenantModel.create({
    slug: 'globex',
    name: 'Globex Industries',
    webhookSecrets: {}, // no secret configured on purpose — demonstrates the "no secret => allow" path
  });

  await RuleModel.create({
    tenantId: acme._id,
    name: 'Notify sales on large Shopify orders',
    source: 'shopify',
    eventType: 'order.created',
    conditions: [{ field: 'total_price', operator: 'gt', value: 500 }],
    actions: [
      {
        type: 'webhook_notify',
        config: {
          url: 'https://httpbin.org/post',
          messageTemplate: 'Big order! #{{order_id}} for ${{total_price}}',
        },
      },
      {
        type: 'crm_update',
        config: { idField: 'customer_id', fieldsToSync: ['customer_id', 'total_price'] },
      },
    ],
    enabled: true,
  });

  await RuleModel.create({
    tenantId: acme._id,
    name: 'Sync every paid order to CRM',
    source: 'shopify',
    eventType: 'order.created',
    conditions: [{ field: 'status', operator: 'equals', value: 'paid' }],
    actions: [
      {
        type: 'crm_update',
        config: {
          idField: 'order_id',
          fieldsToSync: ['order_id', 'status', 'total_price'],
          // 30% simulated failure so the reviewer can watch retry + replay work
          simulateFailureRate: 0.3,
        },
      },
    ],
    enabled: true,
  });

  await RuleModel.create({
    tenantId: globex._id,
    name: 'Notify on deal stage change to Won',
    source: 'crm',
    eventType: 'deal.updated',
    conditions: [{ field: 'stage', operator: 'equals', value: 'won' }],
    actions: [
      {
        type: 'webhook_notify',
        config: {
          url: 'https://httpbin.org/post',
          messageTemplate: 'Deal {{deal_id}} won!',
        },
      },
    ],
    enabled: true,
  });

  console.log('Seeded tenants:');
  console.log(`  acme   -> slug="acme"   secret(shopify)="acme-shopify-secret"`);
  console.log(`  globex -> slug="globex" (no signing secret configured)`);
  console.log('Seeded 3 rules.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

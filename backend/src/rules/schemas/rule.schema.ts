import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RuleDocument = Rule & Document;

export enum ConditionOperator {
  EQUALS = 'equals',
  GREATER_THAN = 'gt',
  CONTAINS = 'contains',
}

// A condition targets a dot-path into the webhook payload, e.g.
// "total_price" or "customer.country".
export class RuleCondition {
  field: string;
  operator: ConditionOperator;
  value: any;
}

export enum ActionType {
  WEBHOOK_NOTIFY = 'webhook_notify', // e.g. "notify sales team" via outbound HTTP POST
  CRM_UPDATE = 'crm_update', // simulated CRM write
}

export class RuleAction {
  type: ActionType;
  config: Record<string, any>; // e.g. { url } for webhook_notify, { field, value } for crm_update
}

@Schema({ timestamps: true })
export class Rule {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  source: string; // must match WebhookEvent.source, e.g. "shopify"

  @Prop({ required: true })
  eventType: string; // must match WebhookEvent.eventType, e.g. "order.created"

  @Prop({ type: [Object], default: [] })
  conditions: RuleCondition[]; // AND-combined

  @Prop({ type: [Object], default: [] })
  actions: RuleAction[]; // run in order

  @Prop({ default: true })
  enabled: boolean;
}

export const RuleSchema = SchemaFactory.createForClass(Rule);
RuleSchema.index({ tenantId: 1, source: 1, eventType: 1, enabled: 1 });

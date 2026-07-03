import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WebhookEventDocument = WebhookEvent & Document;

export enum IngestStatus {
  RECEIVED = 'received', // stored, queued for processing
  PROCESSING = 'processing',
  PROCESSED = 'processed', // rule evaluation ran (regardless of action outcomes)
  DUPLICATE = 'duplicate', // matched an existing idempotency key, not reprocessed
  REJECTED = 'rejected', // failed signature/schema validation, never queued
}

@Schema({ timestamps: true })
export class WebhookEvent {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  source: string; // e.g. "shopify", "stripe", "crm"

  @Prop({ required: true })
  eventType: string; // e.g. "order.created"

  // The idempotency key. Preferred: the delivery ID the sender provides
  // (X-Shopify-Webhook-Id, Stripe-Signature's included id, etc).
  // Fallback: sha256 of (tenantId + source + raw body) if the source doesn't
  // send one — good enough to dedupe true re-deliveries of identical payloads.
  @Prop({ required: true })
  dedupeKey: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, any>;

  @Prop({ type: Object, default: {} })
  headers: Record<string, string>;

  @Prop({ type: String, enum: IngestStatus, default: IngestStatus.RECEIVED })
  status: IngestStatus;

  @Prop()
  receivedAt: Date;
}

export const WebhookEventSchema = SchemaFactory.createForClass(WebhookEvent);

// The core idempotency guarantee lives here, not in application code:
// a unique compound index means two concurrent requests for the same
// delivery cannot both insert successfully, even under a race.
WebhookEventSchema.index(
  { tenantId: 1, source: 1, dedupeKey: 1 },
  { unique: true },
);
WebhookEventSchema.index({ tenantId: 1, createdAt: -1 });

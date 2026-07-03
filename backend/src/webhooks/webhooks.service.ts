import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import {
  IngestStatus,
  WebhookEvent,
  WebhookEventDocument,
} from './schemas/webhook-event.schema';
import { TenantDocument } from '../tenants/schemas/tenant.schema';
import { WEBHOOK_QUEUE } from '../queue/queue.constants';

export interface SignatureCheckResult {
  valid: boolean;
  reason?: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectModel(WebhookEvent.name)
    private readonly eventModel: Model<WebhookEventDocument>,
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Verifies an HMAC-SHA256 signature the way Shopify/Stripe-style webhooks
   * do: sign the raw request body with a shared secret, compare using a
   * constant-time comparison. If the tenant has no secret configured for
   * this source, verification is skipped (useful for local/dev sources) —
   * in production every source should have a secret.
   */
  verifySignature(
    tenant: TenantDocument,
    source: string,
    rawBody: Buffer,
    providedSignature: string | undefined,
  ): SignatureCheckResult {
    const secret = tenant.webhookSecrets?.[source];
    if (!secret) {
      return { valid: true }; // no secret configured for this source — allow through
    }
    if (!providedSignature) {
      return { valid: false, reason: 'missing signature header' };
    }
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const a = Buffer.from(expected);
    const b = Buffer.from(providedSignature.replace(/^sha256=/, ''));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, reason: 'signature mismatch' };
    }
    return { valid: true };
  }

  private computeDedupeKey(
    tenantId: string,
    source: string,
    rawBody: Buffer,
    providedDeliveryId?: string,
  ): string {
    if (providedDeliveryId) return providedDeliveryId;
    return crypto
      .createHash('sha256')
      .update(tenantId)
      .update(source)
      .update(rawBody)
      .digest('hex');
  }

  /**
   * Ingests one webhook: dedupe-insert into Mongo, then enqueue a lightweight
   * job (just the Mongo _id) for async processing. Returns which happened so
   * the controller can respond appropriately, but either way the HTTP
   * response is fast — no rule evaluation happens on this path.
   */
  async ingest(params: {
    tenant: TenantDocument;
    source: string;
    eventType: string;
    rawBody: Buffer;
    payload: Record<string, any>;
    headers: Record<string, string>;
    deliveryId?: string;
  }): Promise<{ status: IngestStatus; eventId?: string }> {
    const tenantId = String(params.tenant._id);
    const dedupeKey = this.computeDedupeKey(
      tenantId,
      params.source,
      params.rawBody,
      params.deliveryId,
    );

    try {
      const doc = await this.eventModel.create({
        tenantId: new Types.ObjectId(tenantId),
        source: params.source,
        eventType: params.eventType,
        dedupeKey,
        payload: params.payload,
        headers: params.headers,
        status: IngestStatus.RECEIVED,
        receivedAt: new Date(),
      });

      // Idempotent job id: even if the enqueue call itself is retried
      // (e.g. process crash between insert and enqueue, then a recovery
      // sweep re-enqueues it), BullMQ will refuse a second job with the
      // same jobId instead of creating a duplicate.
      await this.queue.add(
        'process-event',
        { eventId: String(doc._id), tenantId },
        {
          jobId: String(doc._id),
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: false, // keep failed jobs visible for the replay UI
        },
      );

      return { status: IngestStatus.RECEIVED, eventId: String(doc._id) };
    } catch (err: any) {
      if (err?.code === 11000) {
        // Unique index violation on (tenantId, source, dedupeKey) — this is
        // a re-delivery of an event we've already accepted. This is the
        // expected, common case, not an error: ack fast, do nothing else.
        this.logger.debug(
          `Duplicate webhook ignored: tenant=${tenantId} source=${params.source} key=${dedupeKey}`,
        );
        return { status: IngestStatus.DUPLICATE };
      }
      throw err;
    }
  }

  async listForTenant(tenantId: string, limit = 100) {
    return this.eventModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async findByIdForTenant(tenantId: string, eventId: string) {
    return this.eventModel.findOne({
      _id: new Types.ObjectId(eventId),
      tenantId: new Types.ObjectId(tenantId),
    });
  }

  async markStatus(eventId: string, status: IngestStatus) {
    await this.eventModel.updateOne({ _id: eventId }, { $set: { status } });
  }
}

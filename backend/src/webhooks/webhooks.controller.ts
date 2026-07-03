import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';
import { TenantsService } from '../tenants/tenants.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentTenantId } from '../common/decorators/current-tenant.decorator';
import { IngestWebhookQueryDto } from './dto/ingest-webhook.dto';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly tenantsService: TenantsService,
  ) {}

  /**
   * POST /webhooks/:tenantSlug/:source
   *
   * This is the endpoint external platforms call — Shopify, Stripe, a CRM,
   * etc. Each tenant gets its own URL (containing their slug), which is how
   * tenant scoping is established for ingestion: there is no way to post an
   * event into a different tenant's pipeline by tampering with a header,
   * because the tenant comes from the path, resolved server-side against
   * the DB before anything is written.
   *
   * Order of operations matters for the "reject spoofed/malformed requests
   * before they touch the DB" requirement:
   *   1. resolve tenant (404 if unknown slug)
   *   2. verify HMAC signature against the RAW body (401 if invalid)
   *   3. only then parse/store the event
   */
  @Post(':tenantSlug/:source')
  async receive(
    @Param('tenantSlug') tenantSlug: string,
    @Param('source') source: string,
    @Query() query: IngestWebhookQueryDto,
    @Headers() headers: Record<string, string>,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);

    const rawBody: Buffer = (req as any).rawBody ?? Buffer.from(
      JSON.stringify(req.body ?? {}),
    );

    const providedSignature =
      headers['x-webhook-signature'] || headers['x-hub-signature-256'];
    const sigCheck = this.webhooksService.verifySignature(
      tenant,
      source,
      rawBody,
      providedSignature,
    );
    if (!sigCheck.valid) {
      throw new UnauthorizedException(
        `Webhook signature verification failed: ${sigCheck.reason}`,
      );
    }

    let payload: Record<string, any>;
    try {
      payload =
        typeof req.body === 'object' && req.body !== null
          ? req.body
          : JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Body is not valid JSON');
    }

    const eventType =
      headers['x-event-type'] || query.eventType || payload.event || payload.type;
    if (!eventType) {
      throw new BadRequestException(
        'Could not determine event type (expected X-Event-Type header, ?eventType=, or a "event"/"type" field in the payload)',
      );
    }

    const deliveryId =
      headers['x-delivery-id'] ||
      headers['x-shopify-webhook-id'] ||
      headers['x-request-id'];

    const result = await this.webhooksService.ingest({
      tenant,
      source,
      eventType,
      rawBody,
      payload,
      headers,
      deliveryId,
    });

    // Always ack fast with 200, whether newly received or a known duplicate —
    // re-delivery of a duplicate is not an error from the sender's point of
    // view, and returning non-2xx here would only cause more retries.
    return { received: true, ...result };
  }

  @Get()
  @UseGuards(TenantGuard)
  async list(@CurrentTenantId() tenantId: string) {
    return this.webhooksService.listForTenant(tenantId);
  }
}

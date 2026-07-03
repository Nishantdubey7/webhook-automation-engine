import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { WebhookEvent, WebhookEventSchema } from './schemas/webhook-event.schema';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { WEBHOOK_QUEUE } from '../queue/queue.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebhookEvent.name, schema: WebhookEventSchema },
    ]),
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
    TenantsModule,
  ],
  providers: [WebhooksService],
  controllers: [WebhooksController],
  exports: [WebhooksService],
})
export class WebhooksModule {}

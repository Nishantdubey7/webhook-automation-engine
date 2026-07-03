import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { WebhookEvent, WebhookEventSchema } from '../webhooks/schemas/webhook-event.schema';
import { JobRun, JobRunSchema } from '../jobs/schemas/job-run.schema';
import { CrmRecord, CrmRecordSchema } from '../jobs/schemas/crm-record.schema';
import { WebhookProcessor } from './webhook.processor';
import { ActionRegistry } from './actions/action.registry';
import { WebhookNotifyAction } from './actions/webhook-notify.action';
import { CrmUpdateAction } from './actions/crm-update.action';
import { RulesModule } from '../rules/rules.module';
import { JobsModule } from '../jobs/jobs.module';
import { WEBHOOK_QUEUE } from './queue.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebhookEvent.name, schema: WebhookEventSchema },
      { name: JobRun.name, schema: JobRunSchema },
      { name: CrmRecord.name, schema: CrmRecordSchema },
    ]),
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
    RulesModule,
    JobsModule,
  ],
  providers: [WebhookProcessor, ActionRegistry, WebhookNotifyAction, CrmUpdateAction],
})
export class QueueModule {}

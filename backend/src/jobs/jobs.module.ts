import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';

import { JobRun, JobRunSchema } from './schemas/job-run.schema';
import { CrmRecord, CrmRecordSchema } from './schemas/crm-record.schema';

import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';

import { WEBHOOK_QUEUE } from '../queue/queue.constants';

// Import TenantsModule
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    // This makes TenantsService available for TenantGuard
    TenantsModule,

    MongooseModule.forFeature([
      { name: JobRun.name, schema: JobRunSchema },
      { name: CrmRecord.name, schema: CrmRecordSchema },
    ]),

    BullModule.registerQueue({
      name: WEBHOOK_QUEUE,
    }),
  ],

  providers: [JobsService],

  controllers: [JobsController],

  exports: [JobsService],
})
export class JobsModule {}
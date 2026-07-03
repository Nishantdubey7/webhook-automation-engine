import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentTenantId } from '../common/decorators/current-tenant.decorator';
import { JobStatus } from './schemas/job-run.schema';

@Controller('jobs')
@UseGuards(TenantGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  list(@CurrentTenantId() tenantId: string, @Query('status') status?: JobStatus) {
    return this.jobsService.listForTenant(tenantId, status ? { status } : {});
  }

  @Get(':id')
  findOne(@CurrentTenantId() tenantId: string, @Param('id') id: string) {
    return this.jobsService.findByIdForTenant(tenantId, id);
  }

  @Post(':id/replay')
  replay(@CurrentTenantId() tenantId: string, @Param('id') id: string) {
    return this.jobsService.replay(tenantId, id);
  }
}

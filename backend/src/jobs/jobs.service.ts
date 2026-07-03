import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model, Types } from 'mongoose';
import { Queue } from 'bullmq';
import { ActionStatus, JobRun, JobRunDocument, JobStatus } from './schemas/job-run.schema';
import { WEBHOOK_QUEUE } from '../queue/queue.constants';

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(JobRun.name) private readonly jobRunModel: Model<JobRunDocument>,
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Idempotent upsert: if a JobRun for this (event, rule) already exists —
   * e.g. because the worker crashed mid-processing and the event job is
   * being retried — we reuse it rather than creating a duplicate, so a
   * tenant never sees two job history rows for the same rule firing once.
   */
  async upsertForRuleMatch(params: {
    tenantId: string;
    eventId: string;
    ruleId: string;
    ruleName: string;
  }): Promise<JobRunDocument> {
    const existing = await this.jobRunModel.findOne({
      tenantId: new Types.ObjectId(params.tenantId),
      eventId: new Types.ObjectId(params.eventId),
      ruleId: new Types.ObjectId(params.ruleId),
      isReplay: false,
    });
    if (existing) return existing;

    return this.jobRunModel.create({
      tenantId: new Types.ObjectId(params.tenantId),
      eventId: new Types.ObjectId(params.eventId),
      ruleId: new Types.ObjectId(params.ruleId),
      ruleName: params.ruleName,
      status: JobStatus.PROCESSING,
      actionResults: [],
      attempts: 0,
    });
  }

  async save(jobRun: JobRunDocument): Promise<JobRunDocument> {
    return jobRun.save();
  }

  async findByIdForTenant(tenantId: string, id: string): Promise<JobRunDocument> {
    const job = await this.jobRunModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!job) throw new NotFoundException('Job not found for this tenant');
    return job;
  }

  async listForTenant(
    tenantId: string,
    filter: { status?: JobStatus } = {},
    limit = 200,
  ): Promise<JobRunDocument[]> {
    return this.jobRunModel
      .find({ tenantId: new Types.ObjectId(tenantId), ...filter })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  /**
   * Replay: resets any non-succeeded actions on this JobRun back to pending
   * and re-enqueues a dedicated 'replay-job-run' BullMQ job. Actions that
   * already succeeded are left untouched — replay does not re-notify Slack
   * a second time just because a *different* action in the same rule failed.
   */
  async replay(tenantId: string, jobRunId: string): Promise<JobRunDocument> {
    const job = await this.findByIdForTenant(tenantId, jobRunId);

    job.actionResults = job.actionResults.map((r) =>
      r.status === ActionStatus.SUCCEEDED ? r : { ...r, status: ActionStatus.PENDING, error: undefined },
    );
    job.status = JobStatus.QUEUED;
    job.error = undefined;
    await job.save();

    await this.queue.add(
      'replay-job-run',
      { jobRunId: String(job._id), tenantId },
      {
        // Unique-ish jobId per replay attempt so repeated replay clicks don't
        // collide with an in-flight replay of the same job run.
        jobId: `replay-${job._id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    );

    return job;
  }
}

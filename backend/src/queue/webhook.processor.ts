import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job } from 'bullmq';
import { WEBHOOK_QUEUE } from './queue.constants';
import {
  IngestStatus,
  WebhookEvent,
  WebhookEventDocument,
} from '../webhooks/schemas/webhook-event.schema';
import { JobRun, JobRunDocument, ActionStatus, JobStatus } from '../jobs/schemas/job-run.schema';
import { RulesService } from '../rules/rules.service';
import { RuleEngineService } from '../rules/rule-engine.service';
import { JobsService } from '../jobs/jobs.service';
import { ActionRegistry } from './actions/action.registry';

@Processor(WEBHOOK_QUEUE, {
  concurrency: 10, // tune per the scaling discussion in the README
})
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    @InjectModel(WebhookEvent.name)
    private readonly eventModel: Model<WebhookEventDocument>,
    @InjectModel(JobRun.name)
    private readonly jobRunModel: Model<JobRunDocument>,
    private readonly rulesService: RulesService,
    private readonly ruleEngine: RuleEngineService,
    private readonly jobsService: JobsService,
    private readonly actionRegistry: ActionRegistry,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    if (job.name === 'process-event') {
      return this.processEvent(job);
    }
    if (job.name === 'replay-job-run') {
      return this.processReplay(job);
    }
    this.logger.warn(`Unknown job name: ${job.name}`);
  }

  /**
   * Fresh event: evaluate every enabled rule whose (source, eventType)
   * matches, run each matching rule's actions, record a JobRun per rule.
   *
   * Idempotency under crash/retry: upsertForRuleMatch reuses an existing
   * JobRun instead of creating a new one, and runActionsForJobRun skips any
   * action that's already SUCCEEDED. So if the worker dies after rule A's
   * actions ran but before rule B's did, a retry re-does only rule B (and
   * any of rule A's actions that hadn't yet succeeded) — never a duplicate
   * notify/CRM-write for what already completed.
   */
  private async processEvent(job: Job<{ eventId: string; tenantId: string }>) {
    const { eventId, tenantId } = job.data;

    const event = await this.eventModel.findById(eventId);
    if (!event) {
      // Should not happen (we always create the event before enqueueing),
      // but if it does, don't retry forever against a nonexistent doc.
      this.logger.error(`process-event: event ${eventId} not found, dropping job`);
      return;
    }

    await this.eventModel.updateOne(
      { _id: eventId },
      { $set: { status: IngestStatus.PROCESSING } },
    );

    const matchingTriggers = await this.rulesService.findMatchingTriggers(
      tenantId,
      event.source,
      event.eventType,
    );

    let anyFailure = false;

    for (const rule of matchingTriggers) {
      if (!this.ruleEngine.matches(event.payload, rule.conditions as any)) {
        continue; // trigger matched (source+eventType) but conditions didn't
      }

      const jobRun = await this.jobsService.upsertForRuleMatch({
        tenantId,
        eventId,
        ruleId: String(rule._id),
        ruleName: rule.name,
      });

      const outcome = await this.runActionsForJobRun(jobRun, rule.actions as any, event.payload, tenantId);
      if (!outcome) anyFailure = true;
    }

    await this.eventModel.updateOne(
      { _id: eventId },
      { $set: { status: IngestStatus.PROCESSED } },
    );

    if (anyFailure) {
      // Throwing fails the BullMQ job, which triggers its configured
      // backoff/retry. Because everything above is idempotent, the retry
      // is cheap: it re-checks rules (fast) and only re-executes actions
      // that are still pending/failed.
      throw new Error(
        `One or more actions failed for event ${eventId}; will retry per backoff policy`,
      );
    }
  }

  private async processReplay(job: Job<{ jobRunId: string; tenantId: string }>) {
    const { jobRunId } = job.data;
    const jobRun = await this.jobRunModel.findById(jobRunId);
    if (!jobRun) {
      this.logger.error(`replay-job-run: JobRun ${jobRunId} not found, dropping job`);
      return;
    }
    const event = await this.eventModel.findById(jobRun.eventId);
    if (!event) {
      jobRun.status = JobStatus.FAILED;
      jobRun.error = 'Source event no longer exists';
      await jobRun.save();
      return;
    }

    const rules = await this.rulesService.findMatchingTriggers(
      String(jobRun.tenantId),
      event.source,
      event.eventType,
    );
    const rule = rules.find((r) => String(r._id) === String(jobRun.ruleId));
    const actions = rule ? rule.actions : this.actionsFromLastRun(jobRun);

    const success = await this.runActionsForJobRun(
      jobRun,
      actions as any,
      event.payload,
      String(jobRun.tenantId),
    );

    if (!success) {
      throw new Error(`Replay of job ${jobRunId} still has failing actions`);
    }
  }

  /** Fallback if the rule was deleted/edited since the original run: replay whatever action types are already recorded. */
  private actionsFromLastRun(jobRun: JobRunDocument) {
    return jobRun.actionResults.map((r) => ({ type: r.type, config: {} }));
  }

  /**
   * Runs (or resumes) all actions for a single JobRun. Returns true if the
   * job run ended COMPLETED, false if any action is still failing.
   */
  private async runActionsForJobRun(
    jobRun: JobRunDocument,
    ruleActions: { type: string; config: Record<string, any> }[],
    eventPayload: Record<string, any>,
    tenantId: string,
  ): Promise<boolean> {
    jobRun.status = JobStatus.PROCESSING;
    jobRun.attempts += 1;

    // Ensure actionResults has one slot per configured action, preserving
    // any already-recorded outcome (this is what makes resume idempotent).
    if (jobRun.actionResults.length === 0) {
      jobRun.actionResults = ruleActions.map((a) => ({
        type: a.type,
        status: ActionStatus.PENDING,
        attempt: 0,
      })) as any;
    }

    let allSucceeded = true;

    for (let i = 0; i < jobRun.actionResults.length; i++) {
      const result = jobRun.actionResults[i];
      if (result.status === ActionStatus.SUCCEEDED) continue; // already done — skip on resume

      const config = ruleActions[i]?.config ?? {};
      const impl = this.actionRegistry.get(result.type);

      result.attempt += 1;
      if (!impl) {
        result.status = ActionStatus.FAILED;
        result.error = `No implementation registered for action type "${result.type}"`;
        allSucceeded = false;
        continue;
      }

      try {
        const outcome = await impl.execute({ tenantId, eventPayload, config });
        if (outcome.success) {
          result.status = ActionStatus.SUCCEEDED;
          result.output = outcome.output;
          result.error = undefined;
          result.ranAt = new Date();
        } else {
          result.status = ActionStatus.FAILED;
          result.error = outcome.error;
          allSucceeded = false;
        }
      } catch (err: any) {
        result.status = ActionStatus.FAILED;
        result.error = err?.message ?? 'unknown error';
        allSucceeded = false;
      }
    }

    jobRun.status = allSucceeded ? JobStatus.COMPLETED : JobStatus.PARTIAL_FAILURE;
    jobRun.markModified('actionResults');
    await jobRun.save();
    return allSucceeded;
  }
}

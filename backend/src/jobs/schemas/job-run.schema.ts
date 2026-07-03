import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type JobRunDocument = JobRun & Document;

export enum JobStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed', // all actions succeeded
  PARTIAL_FAILURE = 'partial_failure', // some actions failed after retries
  FAILED = 'failed', // job itself errored (e.g. rule eval threw)
}

export enum ActionStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

export class ActionResult {
  type: string;
  status: ActionStatus;
  attempt: number;
  error?: string;
  output?: Record<string, any>;
  ranAt?: Date;
}

@Schema({ timestamps: true })
export class JobRun {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'WebhookEvent', index: true })
  eventId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Rule' })
  ruleId: Types.ObjectId;

  @Prop({ required: true })
  ruleName: string; // denormalized so the UI/audit trail survives rule edits/deletes

  @Prop({ type: String, enum: JobStatus, default: JobStatus.QUEUED })
  status: JobStatus;

  @Prop({ type: [Object], default: [] })
  actionResults: ActionResult[];

  @Prop({ default: 0 })
  attempts: number;

  @Prop()
  error?: string;

  @Prop({ default: false })
  isReplay: boolean;

  @Prop({ type: Types.ObjectId, ref: 'JobRun' })
  replayOf?: Types.ObjectId;
}

export const JobRunSchema = SchemaFactory.createForClass(JobRun);
JobRunSchema.index({ tenantId: 1, createdAt: -1 });
JobRunSchema.index({ tenantId: 1, status: 1 });

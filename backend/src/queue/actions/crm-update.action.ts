import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CrmRecord, CrmRecordDocument } from '../../jobs/schemas/crm-record.schema';
import { ActionContext, ActionOutcome, WebhookAction } from './action.interface';

/**
 * Simulated CRM write: upserts a record keyed by a field from the event
 * payload (config.idField, e.g. "customer_id" or "order_id").
 *
 * config.simulateFailureRate (0-1, optional) lets you deliberately make this
 * action fail some fraction of the time — useful for demonstrating the
 * retry/replay flow without needing an actually-flaky external dependency.
 */
@Injectable()
export class CrmUpdateAction implements WebhookAction {
  readonly type = 'crm_update';

  constructor(
    @InjectModel(CrmRecord.name)
    private readonly crmModel: Model<CrmRecordDocument>,
  ) {}

  async execute(ctx: ActionContext): Promise<ActionOutcome> {
    const idField = ctx.config?.idField;
    if (!idField) {
      return { success: false, error: 'crm_update action is missing config.idField' };
    }
    const externalId = ctx.eventPayload?.[idField];
    if (externalId === undefined) {
      return {
        success: false,
        error: `payload has no field "${idField}" to use as the CRM record id`,
      };
    }

    const failureRate = ctx.config?.simulateFailureRate ?? 0;
    if (failureRate > 0 && Math.random() < failureRate) {
      return { success: false, error: 'simulated CRM write timeout' };
    }

    const setFields = ctx.config?.fieldsToSync
      ? Object.fromEntries(
          (ctx.config.fieldsToSync as string[]).map((f) => [f, ctx.eventPayload?.[f]]),
        )
      : ctx.eventPayload;

    const record = await this.crmModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(ctx.tenantId), externalId: String(externalId) },
      { $set: { fields: setFields } },
      { new: true, upsert: true },
    );

    return { success: true, output: { crmRecordId: String(record._id) } };
  }
}

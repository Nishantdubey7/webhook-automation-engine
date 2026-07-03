import { Injectable } from '@nestjs/common';
import { WebhookAction } from './action.interface';
import { WebhookNotifyAction } from './webhook-notify.action';
import { CrmUpdateAction } from './crm-update.action';

@Injectable()
export class ActionRegistry {
  private readonly actions = new Map<string, WebhookAction>();

  constructor(
    webhookNotify: WebhookNotifyAction,
    crmUpdate: CrmUpdateAction,
  ) {
    this.register(webhookNotify);
    this.register(crmUpdate);
  }

  private register(action: WebhookAction) {
    this.actions.set(action.type, action);
  }

  get(type: string): WebhookAction | undefined {
    return this.actions.get(type);
  }
}

export interface ActionContext {
  tenantId: string;
  eventPayload: Record<string, any>;
  config: Record<string, any>;
}

export interface ActionOutcome {
  success: boolean;
  output?: Record<string, any>;
  error?: string;
}

export interface WebhookAction {
  readonly type: string;
  execute(ctx: ActionContext): Promise<ActionOutcome>;
}

import { Injectable, Logger } from '@nestjs/common';
import { ActionContext, ActionOutcome, WebhookAction } from './action.interface';

/**
 * Simulates "notify the sales team" by POSTing a summary to an outbound
 * URL (config.url) — e.g. a Slack incoming webhook, or in this sample repo,
 * any test endpoint like https://webhook.site/<id> or httpbin.org/post.
 *
 * This is a REAL network call, so it demonstrates genuine downstream
 * failure: unreachable host, timeout, or non-2xx response all surface as a
 * failed action, which is what triggers BullMQ's retry/backoff and shows
 * up as FAILED in the job history.
 */
@Injectable()
export class WebhookNotifyAction implements WebhookAction {
  readonly type = 'webhook_notify';
  private readonly logger = new Logger(WebhookNotifyAction.name);

  async execute(ctx: ActionContext): Promise<ActionOutcome> {
    const url = ctx.config?.url;
    if (!url) {
      return { success: false, error: 'webhook_notify action is missing config.url' };
    }

    const message =
      ctx.config?.messageTemplate?.replace(
        /\{\{(\w+)\}\}/g,
        (_: string, key: string) => String(ctx.eventPayload?.[key] ?? ''),
      ) ?? `Automation triggered for tenant ${ctx.tenantId}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, payload: ctx.eventPayload }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          success: false,
          error: `notify target responded ${res.status} ${res.statusText}`,
        };
      }
      return { success: true, output: { url, statusCode: res.status } };
    } catch (err: any) {
      clearTimeout(timeout);
      this.logger.warn(`webhook_notify failed: ${err.message}`);
      return { success: false, error: err.message ?? 'network error' };
    }
  }
}

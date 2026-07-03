import { Injectable } from '@nestjs/common';
import { ConditionOperator, RuleCondition } from './schemas/rule.schema';

@Injectable()
export class RuleEngineService {
  private getField(payload: Record<string, any>, path: string): any {
    return path
      .split('.')
      .reduce(
        (acc, key) => (acc === undefined || acc === null ? undefined : acc[key]),
        payload,
      );
  }

  private evaluateCondition(
    payload: Record<string, any>,
    condition: RuleCondition,
  ): boolean {
    const actual = this.getField(payload, condition.field);

    switch (condition.operator) {
      case ConditionOperator.EQUALS:
        // Loose-ish equality on primitives; covers "status" === "paid" and
        // numeric matches like total === 500 regardless of string/number.
        return String(actual) === String(condition.value);

      case ConditionOperator.GREATER_THAN:
        return Number(actual) > Number(condition.value);

      case ConditionOperator.CONTAINS:
        if (typeof actual === 'string') {
          return actual.includes(String(condition.value));
        }
        if (Array.isArray(actual)) {
          return actual.includes(condition.value);
        }
        return false;

      default:
        return false;
    }
  }

  /** All conditions must pass (AND). An empty condition list always matches. */
  matches(payload: Record<string, any>, conditions: RuleCondition[]): boolean {
    return conditions.every((c) => this.evaluateCondition(payload, c));
  }
}

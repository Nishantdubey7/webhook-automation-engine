import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ActionType, ConditionOperator } from '../schemas/rule.schema';

class ConditionDto {
  @IsString()
  field: string;

  @IsEnum(ConditionOperator)
  operator: ConditionOperator;

  value: any;
}

class ActionDto {
  @IsEnum(ActionType)
  type: ActionType;

  @IsOptional()
  config?: Record<string, any>;
}

export class CreateRuleDto {
  @IsString()
  name: string;

  @IsString()
  source: string;

  @IsString()
  eventType: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions: ConditionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionDto)
  actions: ActionDto[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

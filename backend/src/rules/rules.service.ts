import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Rule, RuleDocument } from './schemas/rule.schema';
import { CreateRuleDto } from './dto/create-rule.dto';

@Injectable()
export class RulesService {
  constructor(
    @InjectModel(Rule.name) private readonly ruleModel: Model<RuleDocument>,
  ) {}

  async create(tenantId: string, dto: CreateRuleDto): Promise<RuleDocument> {
    return this.ruleModel.create({ ...dto, tenantId: new Types.ObjectId(tenantId) });
  }

  async findAllForTenant(tenantId: string): Promise<RuleDocument[]> {
    return this.ruleModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 });
  }

  /** Used by the worker: all enabled rules matching a given event's trigger. */
  async findMatchingTriggers(
    tenantId: string,
    source: string,
    eventType: string,
  ): Promise<RuleDocument[]> {
    return this.ruleModel.find({
      tenantId: new Types.ObjectId(tenantId),
      source,
      eventType,
      enabled: true,
    });
  }

  async update(
    tenantId: string,
    ruleId: string,
    dto: Partial<CreateRuleDto> & { enabled?: boolean },
  ): Promise<RuleDocument> {
    const rule = await this.ruleModel.findOneAndUpdate(
      { _id: ruleId, tenantId: new Types.ObjectId(tenantId) },
      { $set: dto },
      { new: true },
    );
    if (!rule) throw new NotFoundException('Rule not found for this tenant');
    return rule;
  }

  async remove(tenantId: string, ruleId: string): Promise<void> {
    const res = await this.ruleModel.deleteOne({
      _id: ruleId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (res.deletedCount === 0) {
      throw new NotFoundException('Rule not found for this tenant');
    }
  }
}

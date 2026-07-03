import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Rule, RuleSchema } from './schemas/rule.schema';
import { RulesService } from './rules.service';
import { RulesController } from './rules.controller';
import { RuleEngineService } from './rule-engine.service';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Rule.name, schema: RuleSchema }]),
    TenantsModule,
  ],
  providers: [RulesService, RuleEngineService],
  controllers: [RulesController],
  exports: [RulesService, RuleEngineService],
})
export class RulesModule {}

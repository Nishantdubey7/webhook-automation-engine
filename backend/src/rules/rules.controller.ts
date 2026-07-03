import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RulesService } from './rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentTenantId } from '../common/decorators/current-tenant.decorator';

@Controller('rules')
@UseGuards(TenantGuard)
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post()
  create(@CurrentTenantId() tenantId: string, @Body() dto: CreateRuleDto) {
    return this.rulesService.create(tenantId, dto);
  }

  @Get()
  findAll(@CurrentTenantId() tenantId: string) {
    return this.rulesService.findAllForTenant(tenantId);
  }

  @Patch(':id')
  update(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateRuleDto>,
  ) {
    return this.rulesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentTenantId() tenantId: string, @Param('id') id: string) {
    return this.rulesService.remove(tenantId, id);
  }
}

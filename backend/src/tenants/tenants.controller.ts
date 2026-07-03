import { Body, Controller, Get, Post } from '@nestjs/common';
import { TenantsService } from './tenants.service';

// Deliberately unauthenticated: per the spec, full auth is out of scope.
// The UI uses this only to populate a "login as tenant" dropdown.
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }

  @Post()
  create(
    @Body() body: { slug: string; name: string; webhookSecrets?: Record<string, string> },
  ) {
    return this.tenantsService.create(body);
  }
}

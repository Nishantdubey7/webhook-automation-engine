import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantDocument } from '../../tenants/schemas/tenant.schema';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantDocument => {
    const req = ctx.switchToHttp().getRequest();
    return req.tenant;
  },
);

export const CurrentTenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest();
    return req.tenantId;
  },
);

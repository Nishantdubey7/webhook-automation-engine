import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantsService } from '../../tenants/tenants.service';

/**
 * Stubbed auth, as permitted by the spec ("a simple login-as-user-X stub is
 * fine"). The important part is what happens AFTER auth: every controller
 * that touches tenant-scoped data reads req.tenantId from here — never from
 * a client-supplied body/query field — so a tenant can never simply pass a
 * different tenantId and read another tenant's rows.
 *
 * Header: x-tenant-slug: <tenant slug>
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenantsService: TenantsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const slug = req.headers['x-tenant-slug'];
    if (!slug) {
      throw new UnauthorizedException(
        'Missing x-tenant-slug header (stubbed auth: pick a tenant in the UI)',
      );
    }
    const tenant = await this.tenantsService.findBySlug(String(slug));
    req.tenant = tenant;
    req.tenantId = String(tenant._id);
    return true;
  }
}

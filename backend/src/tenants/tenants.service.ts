import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from './schemas/tenant.schema';

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
  ) {}

  async findBySlug(slug: string): Promise<TenantDocument> {
    const tenant = await this.tenantModel.findOne({ slug, active: true });
    if (!tenant) throw new NotFoundException(`Unknown tenant '${slug}'`);
    return tenant;
  }

  async findById(id: string): Promise<TenantDocument> {
    const tenant = await this.tenantModel.findById(id);
    if (!tenant) throw new NotFoundException(`Unknown tenant id '${id}'`);
    return tenant;
  }

  async findAll(): Promise<TenantDocument[]> {
    return this.tenantModel.find().sort({ name: 1 });
  }

  async create(data: {
    slug: string;
    name: string;
    webhookSecrets?: Record<string, string>;
  }): Promise<TenantDocument> {
    return this.tenantModel.create(data);
  }
}

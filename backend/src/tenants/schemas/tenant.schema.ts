import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TenantDocument = Tenant & Document;

@Schema({ timestamps: true })
export class Tenant {
  @Prop({ required: true, unique: true })
  slug: string; // e.g. "acme-corp" — used in the ingestion URL

  @Prop({ required: true })
  name: string;

  // Per-source signing secrets, e.g. { shopify: "whsec_...", stripe: "whsec_..." }
  // Real deployments would store these encrypted at rest; kept plaintext here
  // to keep the sample runnable end-to-end without a KMS dependency.
  @Prop({ type: Object, default: {} })
  webhookSecrets: Record<string, string>;

  @Prop({ default: true })
  active: boolean;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);

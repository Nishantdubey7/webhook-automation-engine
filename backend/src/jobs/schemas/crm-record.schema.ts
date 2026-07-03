import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CrmRecordDocument = CrmRecord & Document;

// Stands in for "our CRM" so crm_update actions have something real to
// write to and the UI has something real to show for that action type.
@Schema({ timestamps: true })
export class CrmRecord {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  externalId: string; // e.g. the Shopify order/customer id this record tracks

  @Prop({ type: Object, default: {} })
  fields: Record<string, any>;
}

export const CrmRecordSchema = SchemaFactory.createForClass(CrmRecord);
CrmRecordSchema.index({ tenantId: 1, externalId: 1 }, { unique: true });

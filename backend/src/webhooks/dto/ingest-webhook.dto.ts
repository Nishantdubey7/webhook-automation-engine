import { IsOptional, IsString } from 'class-validator';

// Most of the payload is source-defined JSON, so we don't strictly type the
// body itself. eventType can come from a header (common) or a query param
// override, used mainly for the sample-data script / manual testing.
export class IngestWebhookQueryDto {
  @IsOptional()
  @IsString()
  eventType?: string;
}

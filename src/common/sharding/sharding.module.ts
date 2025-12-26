import { Global, Module } from '@nestjs/common';
import { ShardingService } from './sharding.service';

@Global()
@Module({
  providers: [ShardingService],
  exports: [ShardingService],
})
export class ShardingModule {}

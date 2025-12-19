import { Module } from '@nestjs/common';
import { TravelPlansService } from './travel-plans.service';
import { TravelPlansController } from './travel-plans.controller';
import { ShardingModule } from '../common/sharding/sharding.module';

@Module({
  imports: [ShardingModule],
  controllers: [TravelPlansController],
  providers: [TravelPlansService],
  exports: [TravelPlansService],
})
export class TravelPlansModule {}

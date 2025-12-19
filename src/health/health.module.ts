import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { ShardingModule } from '../common/sharding/sharding.module';

@Module({
  imports: [TerminusModule, ShardingModule],
  controllers: [HealthController],
})
export class HealthModule {}

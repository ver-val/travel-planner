import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TravelPlansModule } from './travel-plans/travel-plans.module';
import { LocationsModule } from './locations/locations.module';
import { HealthModule } from './health/health.module';
import { ShardingModule } from './common/sharding/sharding.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ShardingModule,
    TravelPlansModule,
    LocationsModule,
    HealthModule,
  ],
})
export class AppModule {}

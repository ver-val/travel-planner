import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TravelPlansModule } from './travel-plans/travel-plans.module';
import { LocationsModule } from './locations/locations.module';
import { TravelPlan } from './travel-plans/travel-plan.entity';
import { Location } from './locations/location.entity';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL || undefined,
        host: process.env.DB_HOST || 'localhost',
        port: +(process.env.DB_PORT || 5432),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASS || 'postgres',
        database: process.env.DB_NAME || 'travel_planner',
        autoLoadEntities: true,
        synchronize: false,
        logging: false,
      }),
    }),
    TypeOrmModule.forFeature([TravelPlan, Location]),
    TravelPlansModule,
    LocationsModule,
    HealthModule,
  ],
})
export class AppModule {}

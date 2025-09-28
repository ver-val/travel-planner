import { DataSource } from 'typeorm';
import { TravelPlan } from './src/travel-plans/travel-plan.entity';
import { Location } from './src/locations/location.entity';
import * as dotenv from 'dotenv';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres',
  database: process.env.DB_NAME || 'travel_planner',
  synchronize: false,
  logging: true,
  entities: [TravelPlan, Location],
  migrations: ['migrations/*.ts'],
});

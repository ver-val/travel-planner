import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  async check() {
    const status = 'ok';
    const apiStatus = { status: 'up' };

    return {
      status,
      info: { api: apiStatus },
      error: {},
      details: { api: apiStatus },
    };
  }

  @Get('/details')
  @HealthCheck()
  async checkDetails() {
    return this.health.check([
      async () => this.db.pingCheck('database'),
    ]);
  }
}

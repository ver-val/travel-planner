import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { ShardingService } from '../common/sharding/sharding.service';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private indicators: HealthIndicatorService,
    private sharding: ShardingService,
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
      async () => {
        const shards = await this.sharding.pingAllShards();
        const allUp = Object.values(shards).every(Boolean);
        return allUp
          ? this.indicators.check('shards').up({ nodes: shards })
          : this.indicators.check('shards').down({ nodes: shards });
      },
    ]);
  }
}

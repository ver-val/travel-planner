import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { TravelPlan } from '../../travel-plans/travel-plan.entity';
import { Location } from '../../locations/location.entity';

type RawShardConfig = string | Partial<Omit<ShardConnectionConfig, 'id'>>;

interface ShardMappingFile {
  virtualNodes: Record<string, RawShardConfig>;
}

export interface ShardConnectionConfig {
  id: string;
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
}

interface LocationLookupResult {
  shardKey: string;
  repo: Repository<Location>;
  location: Location;
}

@Injectable()
export class ShardingService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(ShardingService.name);
  private readonly shardMap: Map<string, ShardConnectionConfig> = new Map();
  private readonly dataSources = new Map<string, DataSource>();
  private readonly defaultUser: string;
  private readonly defaultPass: string;
  private readonly mappingPath: string;
  private readonly registryUrl?: string;

  constructor(private readonly configService: ConfigService) {
    this.defaultUser = this.configService.get<string>('DB_USER') ?? 'postgres';
    this.defaultPass = this.configService.get<string>('DB_PASS') ?? 'postgres';
    this.mappingPath =
      this.configService.get<string>('SHARD_MAP_PATH') ??
      path.join(process.cwd(), 'db', 'mapping.json');
    this.registryUrl = this.configService.get<string>('SHARD_REGISTRY_URL') || undefined;
    // Initial load from file (fast); registry will be loaded on module init if configured
    this.refreshMapping();
  }

  private loadMappingFile(mappingPath: string): Map<string, ShardConnectionConfig> {
    if (!fs.existsSync(mappingPath)) {
      throw new Error(`Shard mapping file not found at ${mappingPath}`);
    }

    const rawContent = fs.readFileSync(mappingPath, 'utf-8');
    const parsed = JSON.parse(rawContent) as ShardMappingFile;

    if (!parsed || typeof parsed !== 'object' || !parsed.virtualNodes) {
      throw new Error('Invalid shard mapping: missing "virtualNodes"');
    }

    const map = new Map<string, ShardConnectionConfig>();
    for (const [key, cfg] of Object.entries(parsed.virtualNodes)) {
      const shardKey = key.toLowerCase();
      const normalized = typeof cfg === 'string' ? { url: cfg } : cfg;
      map.set(shardKey, {
        id: shardKey,
        url: normalized?.url,
        host: normalized?.host,
        port: normalized?.port,
        username: normalized?.username,
        password: normalized?.password,
        database: normalized?.database,
      });
    }

    if (map.size === 0) {
      throw new Error('Shard mapping is empty');
    }

    return map;
  }

  private async loadMappingFromRegistry(): Promise<Map<string, ShardConnectionConfig>> {
    if (!this.registryUrl) {
      throw new Error('Registry URL not configured');
    }
    const client = new Client({ connectionString: this.registryUrl });
    await client.connect();
    try {
      const res = await client.query<{ shard_key: string; url: string }>(
        'SELECT shard_key, url FROM shard_mapping ORDER BY shard_key',
      );
      const map = new Map<string, ShardConnectionConfig>();
      for (const row of res.rows) {
        const key = row.shard_key.toLowerCase();
        map.set(key, { id: key, url: row.url });
      }
      if (map.size === 0) {
        throw new Error('Registry mapping is empty');
      }
      return map;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private refreshMapping(map?: Map<string, ShardConnectionConfig>) {
    const nextMap = map ?? this.loadMappingFile(this.mappingPath);
    this.shardMap.clear();
    for (const [key, cfg] of nextMap.entries()) {
      this.shardMap.set(key, cfg);
    }
  }

  get shardKeys(): string[] {
    return [...this.shardMap.keys()].sort();
  }

  shouldReloadOnError(err: any): boolean {
    const code = err?.code || err?.driverError?.code;
    const msg = String(err?.message || '').toLowerCase();
    const reloadableCodes = new Set([
      'ECONNREFUSED',
      'ENOTFOUND',
      '57P03', // cannot connect now
      '57P01', // admin shutdown
      '42501', // permission denied
      '3D000', // invalid catalog name
    ]);
    if (code && reloadableCodes.has(code)) return true;
    if (msg.includes('permission denied')) return true;
    if (msg.includes('does not exist')) return true;
    if (msg.includes('connection refused')) return true;
    return false;
  }

  async reloadMapping(): Promise<void> {
    this.logger.warn('Reloading shard mapping and resetting pools');
    let loaded: Map<string, ShardConnectionConfig> | null = null;
    if (this.registryUrl) {
      try {
        loaded = await this.loadMappingFromRegistry();
      } catch (e: any) {
        this.logger.error(`Failed to load mapping from registry: ${e?.message || e}`);
      }
    }
    if (!loaded) {
      loaded = this.loadMappingFile(this.mappingPath);
    }

    for (const [key, ds] of this.dataSources.entries()) {
      if (ds.isInitialized) {
        try {
          await ds.destroy();
        } catch (e: any) {
          this.logger.error(`Failed to close pool ${key}: ${e?.message || e}`);
        }
      }
    }
    this.dataSources.clear();
    this.refreshMapping(loaded);
  }

  async onModuleInit() {
    if (this.registryUrl) {
      try {
        await this.reloadMapping();
      } catch (e: any) {
        this.logger.error(`Failed to bootstrap mapping from registry: ${e?.message || e}`);
      }
    }
  }

  resolveShardKey(id: string): string {
    if (!id) {
      throw new BadRequestException('ID is required to resolve shard');
    }
    const shardKey = id.trim().toLowerCase().slice(-1);
    if (!this.shardMap.has(shardKey)) {
      throw new BadRequestException(
        `No shard configured for suffix "${shardKey}"`,
      );
    }
    return shardKey;
  }

  private async dataSourceFor(shardKey: string): Promise<DataSource> {
    const existing = this.dataSources.get(shardKey);
    if (existing?.isInitialized) {
      return existing;
    }

    const config = this.shardMap.get(shardKey);
    if (!config) {
      throw new Error(`Shard config not found for key ${shardKey}`);
    }

    const dataSource = new DataSource({
      type: 'postgres',
      url: config.url,
      host: config.host,
      port: config.port,
      username:
        config.username ?? (config.url ? undefined : this.defaultUser),
      password:
        config.password ?? (config.url ? undefined : this.defaultPass),
      database: config.database,
      entities: [TravelPlan, Location],
      synchronize: false,
      logging: false,
      extra: {
        max: +(process.env.SHARD_POOL_MAX || 10),
        idleTimeoutMillis: +(process.env.SHARD_POOL_IDLE || 30000),
        connectionTimeoutMillis: +(process.env.SHARD_POOL_CONNECT_TIMEOUT || 5000),
        keepAlive: true,
      },
    });

    try {
      await dataSource.initialize();
      this.dataSources.set(shardKey, dataSource);
      return dataSource;
    } catch (err: any) {
      if (this.shouldReloadOnError(err)) {
        await this.reloadMapping();
      }
      throw err;
    }
  }

  async getRepositoriesForPlan(planId: string): Promise<{
    planRepo: Repository<TravelPlan>;
    locationRepo: Repository<Location>;
    shardKey: string;
  }> {
    const shardKey = this.resolveShardKey(planId);
    const dataSource = await this.dataSourceFor(shardKey);
    return {
      shardKey,
      planRepo: dataSource.getRepository(TravelPlan),
      locationRepo: dataSource.getRepository(Location),
    };
  }

  async getAllPlanRepositories(): Promise<
    Array<{ shardKey: string; repo: Repository<TravelPlan> }>
  > {
    const repos: Array<{ shardKey: string; repo: Repository<TravelPlan> }> =
      [];
    for (const shardKey of this.shardKeys) {
      const dataSource = await this.dataSourceFor(shardKey);
      repos.push({ shardKey, repo: dataSource.getRepository(TravelPlan) });
    }
    return repos;
  }

  async findLocationById(id: string): Promise<LocationLookupResult | null> {
    for (const shardKey of this.shardKeys) {
      const dataSource = await this.dataSourceFor(shardKey);
      const repo = dataSource.getRepository(Location);
      const location = await repo.findOne({ where: { id } });
      if (location) {
        return { shardKey, repo, location };
      }
    }
    return null;
  }

  async pingAllShards(): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const shardKey of this.shardKeys) {
      try {
        const dataSource = await this.dataSourceFor(shardKey);
        await dataSource.query('SELECT 1');
        result[shardKey] = true;
      } catch (e: any) {
        const message = e?.message ?? 'unknown error';
        this.logger.error(`Shard ${shardKey} ping failed: ${message}`);
        result[shardKey] = false;
      }
    }
    return result;
  }

  async onModuleDestroy() {
    for (const [key, ds] of this.dataSources.entries()) {
      if (ds.isInitialized) {
        try {
          await ds.destroy();
          this.logger.log(`Shard ${key}: connection pool closed`);
        } catch (e: any) {
          this.logger.error(`Shard ${key}: failed to close pool - ${e?.message || e}`);
        }
      }
    }
  }
}

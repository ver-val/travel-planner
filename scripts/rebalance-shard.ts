import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import { Client } from 'pg';

type RawShardConfig = string | 
{ url?: string; host?: string; port?: number; username?: string; password?: string; database?: string };

interface ShardMappingFile {
  virtualNodes: Record<string, RawShardConfig>;
}

interface ShardConnectionConfig {
  id: string;
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
}

const args = process.argv.slice(2);
const dbArg = args.find((a) => a.startsWith('--db='));
const targetArg = args.find((a) => a.startsWith('--target-url='));
const mapArg = args.find((a) => a.startsWith('--mapping='));
const publicationArg = args.find((a) => a.startsWith('--publication='));
const subscriptionArg = args.find((a) => a.startsWith('--subscription='));
const waitSecondsArg = args.find((a) => a.startsWith('--wait-seconds='));
const registryArg = args.find((a) => a.startsWith('--registry='));

if (!dbArg || !targetArg) {
  console.error('Usage: ts-node scripts/rebalance-shard.ts --db=db_a --target-url=postgres://user:pass@host:5432/db_a [--mapping=./db/mapping.json] [--publication=rebalance_pub] [--subscription=rebalance_sub] [--wait-seconds=120]');
  process.exit(1);
}

const shardKey = dbArg.split('=')[1].trim().toLowerCase();
const targetUrl = targetArg.split('=')[1].trim();
const mappingPath =
  mapArg?.split('=')[1] ||
  process.env.SHARD_MAP_PATH ||
  path.join(process.cwd(), 'db', 'mapping.json');
const registryUrl = registryArg?.split('=')[1] || process.env.SHARD_REGISTRY_URL;
const publicationName = publicationArg?.split('=')[1] || `pub_${shardKey}`;
const subscriptionName = subscriptionArg?.split('=')[1] || `sub_${shardKey}`;
const waitSeconds = parseInt(waitSecondsArg?.split('=')[1] || '120', 10);

function loadMappingFromFile(file: string): Map<string, ShardConnectionConfig> {
  if (!existsSync(file)) {
    throw new Error(`Mapping file not found: ${file}`);
  }
  const raw = readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw) as ShardMappingFile;
  const map = new Map<string, ShardConnectionConfig>();
  for (const [key, cfg] of Object.entries(parsed.virtualNodes || {})) {
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
  return map;
}

async function loadMapping(): Promise<Map<string, ShardConnectionConfig>> {
  if (registryUrl) {
    const client = new Client({ connectionString: registryUrl });
    await client.connect();
    try {
      const res = await client.query<{ shard_key: string; url: string }>(
        'SELECT shard_key, url FROM shard_mapping ORDER BY shard_key',
      );
      if (res.rows.length > 0) {
        const map = new Map<string, ShardConnectionConfig>();
        for (const row of res.rows) {
          const key = row.shard_key.toLowerCase();
          map.set(key, { id: key, url: row.url });
        }
        return map;
      }
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  return loadMappingFromFile(mappingPath);
}

function toPgConfig(cfg: ShardConnectionConfig) {
  if (cfg.url) return { connectionString: cfg.url };
  return {
    host: cfg.host ?? 'localhost',
    port: cfg.port ?? 5432,
    user: cfg.username ?? 'postgres',
    password: cfg.password ?? 'postgres',
    database: cfg.database ?? 'postgres',
  };
}

function parseConnection(target: string) {
  const url = new URL(target);
  const dbName = url.pathname.replace('/', '') || 'postgres';
  return {
    connectionString: target,
    host: url.hostname,
    port: Number(url.port || 5432),
    user: url.username || 'postgres',
    password: url.password || 'postgres',
    database: dbName,
  };
}

async function ensureConnected(urlOrCfg: ShardConnectionConfig | { connectionString: string }): Promise<Client> {
  const client = new Client('connectionString' in urlOrCfg ? urlOrCfg : toPgConfig(urlOrCfg));
  await client.connect();
  return client;
}

async function ensureTargetDatabase(targetUrl: string) {
  const parsed = parseConnection(targetUrl);
  let client: Client | null = null;
  try {
    client = await ensureConnected({ connectionString: targetUrl });
    await client.end();
    return; // DB exists
  } catch (err: any) {
    const code = err?.code;
    if (code !== '3D000') {
      throw err;
    }
  } finally {
    if (client) {
      await client.end().catch(() => undefined);
    }
  }

  // Create DB
  const adminConn = {
    host: parsed.host,
    port: parsed.port,
    user: parsed.user,
    password: parsed.password,
    database: 'postgres',
  };
  const admin = await ensureConnected(adminConn as any);
  await admin.query(`CREATE DATABASE "${parsed.database}"`);
  await admin.end();

  // Apply schema if present
  const schemaPath = path.join(process.cwd(), 'db', 'shards', 'schema', '000_schema.sql');
  if (existsSync(schemaPath)) {
    const schemaSql = readFileSync(schemaPath, 'utf8');
    const dbClient = await ensureConnected({ connectionString: targetUrl });
    await dbClient.query(schemaSql);
    await dbClient.end();
  }
}

async function updateRegistry(shardKey: string, targetUrl: string) {
  if (!registryUrl) return;
  const client = new Client({ connectionString: registryUrl });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS shard_mapping (
        shard_key text PRIMARY KEY,
        url text NOT NULL,
        updated_at timestamptz DEFAULT now()
      );`,
    );
    await client.query(
      `INSERT INTO shard_mapping(shard_key, url) VALUES ($1, $2)
       ON CONFLICT (shard_key) DO UPDATE SET url = EXCLUDED.url, updated_at = now()`,
      [shardKey, targetUrl],
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const mapping = await loadMapping();
  const sourceCfg = mapping.get(shardKey);
  if (!sourceCfg) {
    console.error(`Shard key ${shardKey} not found in mapping${registryUrl ? ' (registry)' : ''}`);
    process.exit(1);
  }

  console.log(`Rebalancing shard "${shardKey}"`);
  console.log(`Source: ${sourceCfg.url || `${sourceCfg.host}:${sourceCfg.port}/${sourceCfg.database}`}`);
  console.log(`Target: ${targetUrl}`);

  await ensureTargetDatabase(targetUrl);
  const source = await ensureConnected(sourceCfg);
  const target = await ensureConnected({ connectionString: targetUrl });

  try {
    try {
      console.log('Step 1: create publication on source');
      await source.query(`CREATE PUBLICATION ${publicationName} FOR TABLE travel_plans, locations`);
    } catch (err: any) {
      if (!String(err?.message || '').includes('already exists')) {
        throw err;
      }
      console.warn(`Publication ${publicationName} already exists on source`);
    }

    try {
      console.log('Step 2: create subscription on target');
      await target.query(
        `CREATE SUBSCRIPTION ${subscriptionName} CONNECTION '${sourceCfg.url}' PUBLICATION ${publicationName} WITH (copy_data = true)`,
      );
    } catch (err: any) {
      if (!String(err?.message || '').includes('already exists')) {
        throw err;
      }
      console.warn(`Subscription ${subscriptionName} already exists on target`);
    }

    console.log(`Step 2b: wait for replication catch-up (up to ${waitSeconds}s)`);
    const started = Date.now();
    let caughtUp = false;
    while (Date.now() - started < waitSeconds * 1000) {
      const res = await target.query<{
        ready: boolean | null;
      }>(
        `SELECT bool_and(srsubstate = 'r') as ready
         FROM pg_subscription_rel WHERE srsubid = (SELECT oid FROM pg_subscription WHERE subname = $1)`,
        [subscriptionName],
      );
      if (res.rows[0]?.ready === true) {
        caughtUp = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!caughtUp) {
      throw new Error('Replication did not catch up in time');
    }
    console.log('Replication caught up');

    console.log('Step 3: lock source tables (ACCESS EXCLUSIVE)');
    await source.query('BEGIN');
    await source.query('LOCK TABLE travel_plans IN ACCESS EXCLUSIVE MODE');
    await source.query('LOCK TABLE locations IN ACCESS EXCLUSIVE MODE');

    console.log('Step 4: promote target (drop subscription) and stop publication');
    await target.query('ALTER SUBSCRIPTION ' + subscriptionName + ' DISABLE');
    await target.query('DROP SUBSCRIPTION ' + subscriptionName);
    await source.query('DROP PUBLICATION ' + publicationName);

    console.log('Step 5: update mapping to target URL');
    if (mappingPath && existsSync(mappingPath)) {
      try {
        const raw = JSON.parse(readFileSync(mappingPath, 'utf8')) as ShardMappingFile;
        raw.virtualNodes[shardKey] = { url: targetUrl };
        writeFileSync(mappingPath, JSON.stringify(raw, null, 2));
      } catch (err: any) {
        console.warn(`Failed to update local mapping file: ${err?.message || err}`);
      }
    }
    await updateRegistry(shardKey, targetUrl);

    console.log('Step 6: revoke read rights on source to signal switch');
    await source.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC');

    await source.query('COMMIT');
    console.log('Rebalance completed. Mapping updated, source locked for reads.');
  } catch (err: any) {
    console.error(`Rebalance failed: ${err?.message || err}`);
    try {
      await source.query('ROLLBACK');
    } catch {
      // ignore
    }
    process.exit(1);
  } finally {
    await Promise.all([
      source.end().catch(() => undefined),
      target.end().catch(() => undefined),
    ]);
  }

}

void main();

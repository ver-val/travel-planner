import { readFileSync, existsSync } from 'fs';
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
const fileArg = args.find((a) => a.startsWith('--file='));
const dirArg = args.find((a) => a.startsWith('--dir='));
const mapArg = args.find((a) => a.startsWith('--mapping='));

if (fileArg && dirArg) {
  console.error('Usage: ts-node scripts/apply-shards.ts --file=path/to/script.sql | --dir=path/to/sql_dir [--mapping=path/to/mapping.json]');
  process.exit(1);
}

const defaultDir = path.join(process.cwd(), 'db', 'migrations');
const scriptPath = fileArg?.split('=')[1];
const scriptsDir = dirArg?.split('=')[1] ?? (!scriptPath ? defaultDir : undefined);
const mappingPath =
  mapArg?.split('=')[1] ||
  process.env.SHARD_MAP_PATH ||
  path.join(process.cwd(), 'db', 'mapping.json');

if (!existsSync(mappingPath)) {
  console.error(`Mapping file not found: ${mappingPath}`);
  process.exit(1);
}

function readScripts(): Array<{ name: string; content: string }> {
  if (scriptPath) {
    if (!existsSync(scriptPath)) {
      console.error(`Script file not found: ${scriptPath}`);
      process.exit(1);
    }
    return [{ name: path.basename(scriptPath), content: readFileSync(scriptPath, 'utf8') }];
  }

  if (!scriptsDir || !existsSync(scriptsDir)) {
    console.error(`Scripts directory not found: ${scriptsDir}`);
    process.exit(1);
  }

  const entries = require('fs').readdirSync(scriptsDir).filter((f: string) => f.endsWith('.sql')).sort();
  if (entries.length === 0) {
    console.error(`No .sql files found in directory: ${scriptsDir}`);
    process.exit(1);
  }
  return entries.map((file: string) => ({
    name: file,
    content: readFileSync(path.join(scriptsDir, file), 'utf8'),
  }));
}

function loadMapping(file: string): Map<string, ShardConnectionConfig> {
  const raw = readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw) as ShardMappingFile;

  if (!parsed || typeof parsed !== 'object' || !parsed.virtualNodes) {
    throw new Error('Invalid mapping file: missing virtualNodes');
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
    throw new Error('Mapping contains no virtual nodes');
  }

  return map;
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

async function main() {
  const shardMap = loadMapping(mappingPath);
  const scripts = readScripts();
  const clients: Array<{ id: string; client: Client }> = [];
  const scriptLabel = scriptPath ? `"${scriptPath}"` : `${scripts.length} file(s) from "${scriptsDir}"`;
  console.log(`Applying ${scriptLabel} to ${shardMap.size} shard(s) using mapping ${mappingPath}`);

  try {
    for (const [id, cfg] of shardMap.entries()) {
      const client = new Client(toPgConfig(cfg));
      await client.connect();
      await client.query('BEGIN');
      for (const script of scripts) {
        await client.query(script.content);
      }
      clients.push({ id, client });
      console.log(`Shard ${id}: script(s) applied`);
    }

    for (const { id, client } of clients) {
      await client.query('COMMIT');
      console.log(`Shard ${id}: committed`);
    }

    console.log('Script applied successfully to all shards');
  } catch (err: any) {
    console.error(`Error applying script: ${err?.message || err}`);
    for (const { id, client } of clients) {
      try {
        await client.query('ROLLBACK');
        console.warn(`Shard ${id}: rolled back`);
      } catch (rollbackErr: any) {
        console.error(`Shard ${id}: rollback failed - ${rollbackErr?.message || rollbackErr}`);
      }
    }
    process.exit(1);
  } finally {
    for (const { client } of clients) {
      await client.end().catch(() => undefined);
    }
  }
}

void main();

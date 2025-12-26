import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { Client } from 'pg';

type RawShardConfig = string | { url?: string };
interface ShardMappingFile {
  virtualNodes: Record<string, RawShardConfig>;
}

const args = process.argv.slice(2);
const registryArg = args.find((a) => a.startsWith('--registry='));
const mappingArg = args.find((a) => a.startsWith('--mapping='));

const registryUrl = registryArg?.split('=')[1] || process.env.SHARD_REGISTRY_URL;
const mappingPath =
  mappingArg?.split('=')[1] ||
  process.env.SHARD_MAP_PATH ||
  path.join(process.cwd(), 'db', 'mapping.json');

if (!registryUrl) {
  console.log('Registry URL not provided. Skipping registry seed.');
  process.exit(0);
}

if (!existsSync(mappingPath)) {
  console.error(`Mapping file not found: ${mappingPath}`);
  process.exit(1);
}

function loadMapping(file: string): Map<string, string> {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as ShardMappingFile;
  const map = new Map<string, string>();
  for (const [key, cfg] of Object.entries(raw.virtualNodes || {})) {
    const url = typeof cfg === 'string' ? cfg : cfg?.url;
    if (!url) continue;
    map.set(key.toLowerCase(), url);
  }
  if (map.size === 0) throw new Error('Mapping file has no entries');
  return map;
}

async function main() {
  const map = loadMapping(mappingPath);
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
    for (const [key, url] of map.entries()) {
      await client.query(
        `INSERT INTO shard_mapping(shard_key, url) VALUES ($1, $2)
         ON CONFLICT (shard_key) DO UPDATE SET url = EXCLUDED.url, updated_at = now()`,
        [key, url],
      );
      console.log(`Upserted shard ${key} -> ${url}`);
    }
    console.log('Seed completed');
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();

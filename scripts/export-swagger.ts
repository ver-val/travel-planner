import 'tsconfig-paths/register';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync, mkdirSync } from 'fs';

async function exportSwagger() {
  try {
    // When running outside Docker, DATABASE_URL may still point to the compose
    // service host (e.g. "postgres"). In that case drop the URL so TypeORM
    // falls back to discrete DB_* vars.
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      try {
        const parsed = new URL(dbUrl);
        if (parsed.hostname === 'postgres' && process.env.DB_HOST) {
          delete process.env.DATABASE_URL;
        }
      } catch {
        // ignore parsing issues and keep original value
      }
    }

    const app = await NestFactory.create(AppModule, { logger: false });
    const config = new DocumentBuilder()
      .setTitle('Travel Planner API')
      .setDescription('REST API for collaborative travel planning with optimistic locking across travel plans and locations.')
      .setVersion('1.0.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    mkdirSync('docs', { recursive: true });
    writeFileSync('docs/traveler_api.json', JSON.stringify(document, null, 2), 'utf-8');
    await app.close();
    // eslint-disable-next-line no-console
    console.log('Swagger JSON exported to docs/traveler_api.json');
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('Failed to export Swagger document. Ensure the database is reachable and environment variables are set.');
    // eslint-disable-next-line no-console
    console.error(err?.message || err);
    process.exit(1);
  }
}

exportSwagger();

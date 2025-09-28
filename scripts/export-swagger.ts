import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync, mkdirSync } from 'fs';

async function exportSwagger() {
  const app = await NestFactory.create(AppModule);
  const config = new DocumentBuilder()
    .setTitle('Travel Planner API')
    .setDescription('REST API for collaborative travel planning with optimistic locking')
    .setVersion('1.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/traveler_api.json', JSON.stringify(document, null, 2), 'utf-8');
  await app.close();
  // eslint-disable-next-line no-console
  console.log('Swagger JSON exported to docs/traveler_api.json');
}
exportSwagger();

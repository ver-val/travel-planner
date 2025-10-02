import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { createAppValidationPipe } from '../../src/common/pipes/app-validation.pipe';
import { AllExceptionsFilter } from '../../src/filters/all-exceptions.filter';
import dataSource from '../../ormconfig';

describe('Travel Plans API (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  async function cleanDb() {
    await ds.query(`TRUNCATE TABLE "travel_plans" RESTART IDENTITY CASCADE;`);
  }

  beforeAll(async () => {
    process.env.DB_HOST = process.env.DB_HOST || 'localhost';
    process.env.DB_PORT = process.env.DB_PORT || '55432';
    process.env.DB_USER = 'postgres';
    process.env.DB_PASS = 'postgres';
    process.env.DB_NAME = 'travel_planner_test';

    ds = await dataSource.initialize();
    await ds.runMigrations();
    await cleanDb();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createAppValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await ds.destroy();
  });

  it('POST /api/travel-plans -> 201, creates plan', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({
        title: 'Test European Journey',
        description: 'Comprehensive testing scenario',
        start_date: '2025-06-01',
        end_date: '2025-06-15',
        budget: 2500.0,
        currency: 'EUR',
        is_public: true,
      })
      .expect(201);

    expect(res.body.title).toBe('Test European Journey');
    expect(res.body.version).toBe(1);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.budget).toBeCloseTo(2500.0, 2);
  });

  it('GET /api/travel-plans/:id -> 200', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: 'Plan A', budget: 1000.0, currency: 'EUR' })
      .expect(201);

    const id = created.body.id;

    const got = await request(app.getHttpServer()).get(`/api/travel-plans/${id}`).expect(200);
    expect(got.body.id).toBe(id);
    expect(got.body.version).toBe(1);
    expect(Array.isArray(got.body.locations)).toBe(true);
  });

  it('PUT /api/travel-plans/:id -> 200 then 409 (optimistic locking)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: 'Race Plan', budget: 1000.0, currency: 'EUR' })
      .expect(201);

    const id = created.body.id;
    const v = created.body.version;

    const ok = await request(app.getHttpServer())
      .put(`/api/travel-plans/${id}`)
      .send({ title: 'Updated Race Plan', description: 'Modified during testing', budget: 2800.0, version: v })
      .expect(200);

    expect(ok.body.version).toBe(2);

    const conflictRes = await request(app.getHttpServer())
      .put(`/api/travel-plans/${id}`)
      .send({ title: 'Should Fail Update', version: v })
      .expect(409);

    expect(conflictRes.body.error).toContain('Conflict');
    expect(conflictRes.body.current_version).toBe(ok.body.version);
  });

  it('PUT /api/travel-plans/:id -> 400 when version missing', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: 'Versioned Plan' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .put(`/api/travel-plans/${created.body.id}`)
      .send({ title: 'Missing version' })
      .expect(400);

    expect(res.body.error).toBe('Validation error');
    expect(res.body.details).toContain('Version is required');
  });

  it('DELETE /api/travel-plans/:id -> 204, then GET -> 404', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: 'Delete Plan', budget: 500.0, currency: 'EUR' })
      .expect(201);

    const id = created.body.id;

    await request(app.getHttpServer()).delete(`/api/travel-plans/${id}`).expect(204);
    await request(app.getHttpServer()).get(`/api/travel-plans/${id}`).expect(404);
  });
});

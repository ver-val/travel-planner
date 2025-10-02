import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { Response } from 'supertest';
import { AppModule } from '../../src/app.module';
import { createAppValidationPipe } from '../../src/common/pipes/app-validation.pipe';
import { AllExceptionsFilter } from '../../src/filters/all-exceptions.filter';
import dataSource from '../../ormconfig';

describe('Validation (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  const expectValidationError = (res: Response, detail?: string) => {
    expect(res.body.error).toBe('Validation error');
    if (detail) {
      expect(res.body.details).toContain(detail);
    }
  };

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

  // ---- Travel plan validation ----
  it('Travel plan: missing title -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ description: 'Plan without title', budget: 1000.0 })
      .expect(400);
    expectValidationError(res, 'Title is required');
  });

  it('Travel plan: empty title -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: '   ' })
      .expect(400);
    expectValidationError(res, 'Title is required');
  });

  it('Travel plan: too long title -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: 'A'.repeat(201) })
      .expect(400);
    expectValidationError(res, 'Title');
  });

  it('Travel plan: invalid date format -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: 'Test Plan', start_date: '2025-13-45', end_date: '2025-06-15' })
      .expect(400);
    expectValidationError(res, 'start_date');
  });

  it('Travel plan: end before start -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: 'Invalid Date Range', start_date: '2025-06-15', end_date: '2025-06-01' })
      .expect(400);
    expectValidationError(res, 'End date must be after start date');
  });

  it('Travel plan: negative budget -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: 'Negative Budget', budget: -500 })
      .expect(400);
    expectValidationError(res, 'Budget must be positive');
  });

  it('Travel plan: invalid currency length -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: 'Invalid Currency', currency: 'EURO' })
      .expect(400);
    expectValidationError(res, 'Currency');
  });

  it('Travel plan: lowercase currency -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: 'Lowercase', currency: 'usd' })
      .expect(400);
    expectValidationError(res, 'Currency');
  });

  it('Travel plan: budget with >2 decimals -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: 'Precise', budget: 1000.123 })
      .expect(400);
    expectValidationError(res);
  });

  it('Travel plan: valid baseline -> 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({
        title: 'Valid Test Plan',
        description: 'This should work',
        start_date: '2025-06-01',
        end_date: '2025-06-15',
        budget: 2500.99,
        currency: 'EUR',
        is_public: true,
      })
      .expect(201);

    expect(res.body.title).toBe('Valid Test Plan');
    expect(Number(res.body.budget)).toBeCloseTo(2500.99, 2);
  });

  it('Travel plan update: missing version -> 400', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: 'Need Version', budget: 100 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .put(`/api/travel-plans/${created.body.id}`)
      .send({ title: 'Updated Without Version' })
      .expect(400);
    expectValidationError(res, 'Version is required');
  });

  it('Travel plan update: zero/negative version -> 400', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title: 'Bad Version', budget: 100 })
      .expect(201);

    const zero = await request(app.getHttpServer())
      .put(`/api/travel-plans/${created.body.id}`)
      .send({ title: 'v0', version: 0 })
      .expect(400);
    expectValidationError(zero, 'Version must be positive');

    const negative = await request(app.getHttpServer())
      .put(`/api/travel-plans/${created.body.id}`)
      .send({ title: 'v-1', version: -1 })
      .expect(400);
    expectValidationError(negative, 'Version must be positive');
  });

  // ---- Location validation ----
  it('Location: missing name -> 400', async () => {
    const plan = await request(app.getHttpServer()).post('/api/travel-plans').send({ title: 'L Plan' }).expect(201);
    const res = await request(app.getHttpServer())
      .post(`/api/travel-plans/${plan.body.id}/locations`)
      .send({ budget: 100 })
      .expect(400);
    expectValidationError(res, 'Name is required');
  });

  it('Location: empty name -> 400', async () => {
    const plan = await request(app.getHttpServer()).post('/api/travel-plans').send({ title: 'L Plan' }).expect(201);
    const res = await request(app.getHttpServer())
      .post(`/api/travel-plans/${plan.body.id}/locations`)
      .send({ name: '' })
      .expect(400);
    expectValidationError(res, 'Name');
  });

  it('Location: name > 200 -> 400', async () => {
    const plan = await request(app.getHttpServer()).post('/api/travel-plans').send({ title: 'L Plan' }).expect(201);
    const res = await request(app.getHttpServer())
      .post(`/api/travel-plans/${plan.body.id}/locations`)
      .send({ name: 'A'.repeat(201) })
      .expect(400);
    expectValidationError(res, 'Name');
  });

  it('Location: invalid lat/lng -> 400', async () => {
    const plan = await request(app.getHttpServer()).post('/api/travel-plans').send({ title: 'L Plan' }).expect(201);
    const lat = await request(app.getHttpServer())
      .post(`/api/travel-plans/${plan.body.id}/locations`)
      .send({ name: 'Bad Lat', latitude: 91 })
      .expect(400);
    expectValidationError(lat, 'Latitude');

    const lng = await request(app.getHttpServer())
      .post(`/api/travel-plans/${plan.body.id}/locations`)
      .send({ name: 'Bad Lng', longitude: 181 })
      .expect(400);
    expectValidationError(lng, 'Longitude');
  });

  it('Location: departure before arrival -> 400', async () => {
    const plan = await request(app.getHttpServer()).post('/api/travel-plans').send({ title: 'L Plan' }).expect(201);
    const res = await request(app.getHttpServer())
      .post(`/api/travel-plans/${plan.body.id}/locations`)
      .send({ name: 'Time', arrival_date: '2025-06-02T15:00:00Z', departure_date: '2025-06-02T09:00:00Z' })
      .expect(400);
    expectValidationError(res, 'Departure date must be after arrival date');
  });

  it('Location: negative budget -> 400', async () => {
    const plan = await request(app.getHttpServer()).post('/api/travel-plans').send({ title: 'L Plan' }).expect(201);
    const res = await request(app.getHttpServer())
      .post(`/api/travel-plans/${plan.body.id}/locations`)
      .send({ name: 'Neg', budget: -50 })
      .expect(400);
    expectValidationError(res, 'Budget must be positive');
  });

  it('Location: valid baseline -> 201', async () => {
    const plan = await request(app.getHttpServer()).post('/api/travel-plans').send({ title: 'L Plan' }).expect(201);
    const res = await request(app.getHttpServer())
      .post(`/api/travel-plans/${plan.body.id}/locations`)
      .send({
        name: 'Valid Test Location',
        address: '123 Test Street',
        latitude: 48.8584,
        longitude: 2.2945,
        arrival_date: '2025-06-02T09:00:00Z',
        departure_date: '2025-06-02T17:00:00Z',
        budget: 150.5,
        notes: 'Valid',
      })
      .expect(201);
    expect(res.body.visit_order).toBe(1);
    expect(Number(res.body.budget)).toBeCloseTo(150.5, 2);
  });

  it('Edges: create location for non-existent plan -> 404', async () => {
    await request(app.getHttpServer())
      .post(`/api/travel-plans/8fe6038f-c978-4d7f-861e-58b50e879207/locations`)
      .send({ name: 'Orphan Location' })
      .expect(404);
  });

  it('Edges: update non-existent location -> 404', async () => {
    await request(app.getHttpServer())
      .put(`/api/locations/8fe6038f-c978-4d7f-861e-58b50e879207`)
      .send({ name: 'Ghost Location' })
      .expect(404);
  });

  it('Edges: invalid UUID format in path -> 400', async () => {
    await request(app.getHttpServer()).get(`/api/travel-plans/invalid-uuid`).expect(400);
  });
});

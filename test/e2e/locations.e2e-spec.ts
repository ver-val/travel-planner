import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { createAppValidationPipe } from '../../src/common/pipes/app-validation.pipe';
import { AllExceptionsFilter } from '../../src/filters/all-exceptions.filter';
import dataSource from '../../ormconfig';

describe('Locations API (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  async function cleanDb() {
    await ds.query(`TRUNCATE TABLE "travel_plans" RESTART IDENTITY CASCADE;`);
  }

  async function createPlan(title = 'Location Test Plan'): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/travel-plans')
      .send({ title });
    expect(res.status).toBe(201);
    return res.body.id as string;
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

  it('POST /api/travel-plans/:id/locations -> auto-ordered 1..n', async () => {
    const planId = await createPlan();

    const l1 = await request(app.getHttpServer())
      .post(`/api/travel-plans/${planId}/locations`)
      .send({ name: 'Eiffel Tower', latitude: 48.8584, longitude: 2.2945, budget: 25.0 })
      .expect(201);
    expect(l1.body.visit_order).toBe(1);

    const l2 = await request(app.getHttpServer())
      .post(`/api/travel-plans/${planId}/locations`)
      .send({ name: 'Louvre Museum', budget: 15.0 })
      .expect(201);
    expect(l2.body.visit_order).toBe(2);

    const l3 = await request(app.getHttpServer())
      .post(`/api/travel-plans/${planId}/locations`)
      .send({ name: 'Arc de Triomphe', budget: 12.0 })
      .expect(201);
    expect(l3.body.visit_order).toBe(3);

    const plan = await request(app.getHttpServer()).get(`/api/travel-plans/${planId}`).expect(200);
    expect(plan.body.locations.length).toBe(3);
    expect(plan.body.locations.map((x: any) => x.visit_order)).toEqual([1, 2, 3]);
  });

  it('PUT /api/locations/:id -> partial update (merge columns)', async () => {
    const planId = await createPlan();
    const created = await request(app.getHttpServer())
      .post(`/api/travel-plans/${planId}/locations`)
      .send({ name: 'Place' })
      .expect(201);
    const locId = created.body.id;
    const version = created.body.version;

    const upd = await request(app.getHttpServer())
      .put(`/api/locations/${locId}`)
      .send({ name: 'Place Updated', budget: 30.0, notes: 'Nice!', version })
      .expect(200);

    expect(upd.body.name).toBe('Place Updated');
    expect(Number(upd.body.budget)).toBeCloseTo(30.0, 2);
    expect(upd.body.version).toBe(version + 1);
    expect(upd.body.notes).toBe('Nice!');
  });

  it('DELETE /api/locations/:id -> 204; план доступний, але з меншою кількістю локацій', async () => {
    const planId = await createPlan();
    const l1 = await request(app.getHttpServer())
      .post(`/api/travel-plans/${planId}/locations`)
      .send({ name: 'A' })
      .expect(201);
    const l2 = await request(app.getHttpServer())
      .post(`/api/travel-plans/${planId}/locations`)
      .send({ name: 'B' })
      .expect(201);

    await request(app.getHttpServer()).delete(`/api/locations/${l2.body.id}`).expect(204);

    const plan = await request(app.getHttpServer()).get(`/api/travel-plans/${planId}`).expect(200);
    expect(plan.body.locations.length).toBe(1);
    expect(plan.body.locations[0].id).toBe(l1.body.id);
  });

  it('Validation & FK -> 400/404', async () => {
    // invalid UUID in path
    const invalidUuidRes = await request(app.getHttpServer())
      .post(`/api/travel-plans/invalid-uuid/locations`)
      .send({ name: 'X' })
      .expect(400);
    expect(invalidUuidRes.body.error).toContain('Invalid UUID format');

    // non-existing plan
    const orphanRes = await request(app.getHttpServer())
      .post(`/api/travel-plans/8fe6038f-c978-4d7f-861e-58b50e879207/locations`)
      .send({ name: 'Orphan Location' })
      .expect(404);
    expect(orphanRes.body.error).toContain('Travel plan not found');

    // invalid dates
    const planId = await createPlan();
    const invalidDateRes = await request(app.getHttpServer())
      .post(`/api/travel-plans/${planId}/locations`)
      .send({ name: 'Bad', arrival_date: '2025-06-10T10:00:00Z', departure_date: '2025-06-10T09:00:00Z' })
      .expect(400);
    expect(invalidDateRes.body.error).toBe('Validation error');
    expect(invalidDateRes.body.details).toContain('Departure date must be after arrival date');

    // invalid coordinates
    const invalidCoordRes = await request(app.getHttpServer())
      .post(`/api/travel-plans/${planId}/locations`)
      .send({ name: 'Bad Coords', latitude: 91 })
      .expect(400);
    expect(invalidCoordRes.body.error).toBe('Validation error');
    expect(invalidCoordRes.body.details).toContain('Latitude');
  });
});

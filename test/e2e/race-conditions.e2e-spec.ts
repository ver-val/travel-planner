import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { createAppValidationPipe } from '../../src/common/pipes/app-validation.pipe';
import { AllExceptionsFilter } from '../../src/filters/all-exceptions.filter';
import dataSource from '../../ormconfig';

describe('Race Conditions (integration)', () => {
    let app: INestApplication;
    let ds: DataSource;

    async function cleanDb() {
        await ds.query(`TRUNCATE TABLE "travel_plans" RESTART IDENTITY CASCADE;`);
    }

    async function createPlan(title = 'Race Condition Test Plan'): Promise<{ id: string; version: number }> {
        const res = await request(app.getHttpServer())
            .post('/api/travel-plans')
            .send({ title, description: 'Testing concurrent operations', budget: 1000.0 });
        expect(res.status).toBe(201);
        return { id: res.body.id, version: res.body.version };
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

    it('Optimistic lock: two concurrent updates, one must fail with 409', async () => {
        const { id, version } = await createPlan();

        const [r1, r2] = await Promise.allSettled([
            request(app.getHttpServer())
                .put(`/api/travel-plans/${id}`)
                .send({ title: 'First Update', budget: 1100.0, version }),
            request(app.getHttpServer())
                .put(`/api/travel-plans/${id}`)
                .send({ title: 'Second Update', budget: 1200.0, version })
        ]);

        const ok = [r1, r2].filter(x => x.status === 'fulfilled' && (x as any).value.status === 200);
        const conflict = [r1, r2].filter(x => x.status === 'fulfilled' && (x as any).value.status === 409);

        expect(ok.length).toBe(1);
        expect(conflict.length).toBe(1);

        const final = await request(app.getHttpServer()).get(`/api/travel-plans/${id}`).expect(200);
        expect(final.body.version).toBe(2);
        expect([1100, 1200]).toContain(Number(final.body.budget));
    });

    it('Concurrent location inserts -> unique visit_order, strictly increasing', async () => {
        const { id } = await createPlan();

        const payloads = Array.from({ length: 5 }).map((_, i) => ({
            name: `Loc ${i}`,
            budget: 50 + i * 10,
        }));

        const results = await Promise.allSettled(
            payloads.map(p =>
                request(app.getHttpServer())
                    .post(`/api/travel-plans/${id}/locations`)
                    .send(p)
            )
        );

        const statuses = results.map(r =>
            r.status === 'fulfilled' ? r.value.status : r.reason?.status
        );
        expect(statuses.every(s => [201, 409].includes(s))).toBe(true);

        const plan = await request(app.getHttpServer()).get(`/api/travel-plans/${id}`).expect(200);

        const orders = plan.body.locations.map((l: any) => l.visit_order);
        const unique = new Set(orders);

        expect(unique.size).toBe(orders.length);

        const sorted = [...orders].sort((a, b) => a - b);
        expect(sorted).toEqual(sorted.map((v, i) => i + 1)); // тобто 1,2,...,n
    });


    it('Concurrent location updates on different columns -> both changes persist', async () => {
        const { id } = await createPlan('Update Merge Plan');

        const created = await request(app.getHttpServer())
            .post(`/api/travel-plans/${id}/locations`)
            .send({ name: 'Target', budget: 50.0, notes: 'Book tickets' })
            .expect(201);

        const locId = created.body.id;
        const baseVersion = created.body.version;

        const [u1, u2] = await Promise.all([
            request(app.getHttpServer()).put(`/api/locations/${locId}`).send({ budget: 75.0, version: baseVersion }),
            request(app.getHttpServer()).put(`/api/locations/${locId}`).send({ notes: 'Tickets booked!', version: baseVersion })
        ]);

        const successResponse = u1.status === 200 ? u1 : u2;
        const conflictResponse = u1.status === 409 ? u1 : u2;

        expect(successResponse.status).toBe(200);
        expect(conflictResponse.status).toBe(409);

        const planAfterConflict = await request(app.getHttpServer()).get(`/api/travel-plans/${id}`).expect(200);
        const currentLoc = planAfterConflict.body.locations.find((l: any) => l.id === locId);
        const retry = await request(app.getHttpServer())
            .put(`/api/locations/${locId}`)
            .send({ notes: 'Tickets booked!', version: currentLoc.version })
            .expect(200);

        const got = await request(app.getHttpServer()).get(`/api/travel-plans/${id}`).expect(200);
        const loc = got.body.locations.find((l: any) => l.id === locId);
        expect(Number(loc.budget)).toBeCloseTo(75.0, 2);
        expect(loc.notes).toBe('Tickets booked!');
        expect(retry.body.version).toBeGreaterThan(currentLoc.version);
    });

    it('Cascade delete: delete plan -> locations gone', async () => {
        const { id } = await createPlan('Cascade Plan');

        await request(app.getHttpServer())
            .post(`/api/travel-plans/${id}/locations`)
            .send({ name: 'L1' })
            .expect(201);

        await request(app.getHttpServer()).delete(`/api/travel-plans/${id}`).expect(204);
        await request(app.getHttpServer()).get(`/api/travel-plans/${id}`).expect(404);
    });
});

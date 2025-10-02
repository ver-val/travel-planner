import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLocationUpdatedAt1700000001001 implements MigrationInterface {
  name = 'AddLocationUpdatedAt1700000001001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "locations" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "locations" DROP COLUMN "updated_at"');
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLocationVersion1700000001000 implements MigrationInterface {
  name = 'AddLocationVersion1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "locations" DROP COLUMN IF EXISTS "version"');
  }
}

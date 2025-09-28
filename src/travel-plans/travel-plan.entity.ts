import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from 'typeorm';
import { Location } from '../locations/location.entity';

@Entity({ name: 'travel_plans' })
export class TravelPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'date', nullable: true })
  start_date?: string | null;

  @Column({ type: 'date', nullable: true })
  end_date?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  budget?: number | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({ type: 'boolean', default: false })
  is_public!: boolean;

  @VersionColumn({ default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @OneToMany(() => Location, (loc) => loc.travel_plan, { cascade: false })
  locations!: Location[];
}

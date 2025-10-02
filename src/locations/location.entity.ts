import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from 'typeorm';
import { TravelPlan } from '../travel-plans/travel-plan.entity';
import { NumericColumnTransformer } from '../common/transformers/numeric.transformer';

@Entity({ name: 'locations' })
@Index(['travel_plan_id', 'visit_order'], { unique: true })
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  travel_plan_id!: string;

  @JoinColumn({ name: 'travel_plan_id' })
  @ManyToOne(() => TravelPlan, (plan) => plan.locations, { onDelete: 'CASCADE' })
  travel_plan!: TravelPlan;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true, transformer: new NumericColumnTransformer() })
  latitude?: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 6, nullable: true, transformer: new NumericColumnTransformer() })
  longitude?: number | null;

  @Column({ type: 'int', nullable: true }) // auto assigned by trigger if null
  visit_order?: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  arrival_date?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  departure_date?: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: new NumericColumnTransformer() })
  budget?: number | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @VersionColumn({ default: 1 })
  version!: number;
}

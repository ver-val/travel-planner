import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TravelPlan } from './travel-plan.entity';
import { Location } from '../locations/location.entity';
import { CreateTravelPlanDto, UpdateTravelPlanDto } from './dto/create-travel-plan.dto';

@Injectable()
export class TravelPlansService {
  constructor(
    @InjectRepository(TravelPlan) private readonly repo: Repository<TravelPlan>,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
  ) { }

  async list(page = 1, limit = 10) {
    const [items, total] = await this.repo.findAndCount({
      order: { updated_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async create(dto: CreateTravelPlanDto): Promise<TravelPlan> {
    if (dto.start_date && dto.end_date && new Date(dto.end_date) < new Date(dto.start_date)) {
      throw new BadRequestException('End date must be after start date');
    }

    const plan = this.repo.create({ ...dto });

    return await this.repo.save(plan);
  }

  async get(id: string): Promise<TravelPlan & { locations: Location[] }> {
    const plan = await this.repo.findOne({ where: { id }, relations: ['locations'] });
    if (!plan) throw new NotFoundException('Travel plan not found');

    console.log('plan:', plan);

    plan.locations = (plan.locations || []).sort(
      (a, b) => (a.visit_order ?? 0) - (b.visit_order ?? 0),
    );
    return plan;
  }

  async update(id: string, dto: UpdateTravelPlanDto): Promise<TravelPlan> {
    const parsedBudget = dto?.budget !== undefined ? Number(dto?.budget) : undefined;

    const qb = this.repo
      .createQueryBuilder()
      .update(TravelPlan)
      .set({
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(parsedBudget !== undefined ? { budget: parsedBudget } : {}),
        version: () => '"version" + 1',
      })
      .where('id = :id AND version = :version', { id, version: dto.version })
      .returning('*');


    const res = await qb.execute();
    if (res.affected === 0) {
      const current = await this.repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Travel plan not found');

      const err: any = new ConflictException(
        'Conflict: entity was modified by another request',
      );
      err.current_version = current.version;
      throw err;
    }

    return res.raw[0];
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete({ id });
    if (res.affected === 0) throw new NotFoundException('Travel plan not found');
  }
}

import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TravelPlan } from './travel-plan.entity';
import { Location } from '../locations/location.entity';
import { CreateTravelPlanDto, UpdateTravelPlanDto } from './dto/create-travel-plan.dto';

@Injectable()
export class TravelPlansService {
  private readonly logger = new Logger(TravelPlansService.name);

  constructor(
    @InjectRepository(TravelPlan) private readonly repo: Repository<TravelPlan>,
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
    this.logger.debug(`Creating travel plan title=${dto.title}`);
    if (dto.start_date && dto.end_date && new Date(dto.end_date) < new Date(dto.start_date)) {
      throw new BadRequestException({ error: 'Validation error', details: 'End date must be after start date' });
    }

    const plan = this.repo.create({ ...dto });
    const saved = await this.repo.save(plan);
    this.logger.debug(`Travel plan created id=${saved.id}`);
    return saved;
  }

  async get(id: string): Promise<TravelPlan & { locations: Location[] }> {
    this.logger.debug(`Fetching travel plan id=${id}`);
    const plan = await this.repo.findOne({ where: { id }, relations: ['locations'] });
    if (!plan) throw new NotFoundException('Travel plan not found');

    plan.locations = (plan.locations || []).sort(
      (a, b) => (a.visit_order ?? 0) - (b.visit_order ?? 0),
    );
    return plan;
  }

  async update(id: string, dto: UpdateTravelPlanDto): Promise<TravelPlan> {
    this.logger.debug(`Updating travel plan id=${id} version=${dto.version}`);

    if (dto.start_date !== undefined || dto.end_date !== undefined) {
      const current = await this.repo.findOne({ where: { id } });
      if (!current) {
        throw new NotFoundException('Travel plan not found');
      }

      const nextStart = dto.start_date !== undefined ? dto.start_date : current.start_date ?? undefined;
      const nextEnd = dto.end_date !== undefined ? dto.end_date : current.end_date ?? undefined;

      if (nextStart && nextEnd && new Date(nextEnd) < new Date(nextStart)) {
        throw new BadRequestException({ error: 'Validation error', details: 'End date must be after start date' });
      }
    }

    const updatePayload: Partial<TravelPlan> = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.start_date !== undefined ? { start_date: dto.start_date } : {}),
      ...(dto.end_date !== undefined ? { end_date: dto.end_date } : {}),
      ...(dto.budget !== undefined ? { budget: dto.budget } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.is_public !== undefined ? { is_public: dto.is_public } : {}),
    };

    const qb = this.repo
      .createQueryBuilder()
      .update(TravelPlan)
      .set({
        ...updatePayload,
        version: () => '"version" + 1',
      })
      .where('id = :id AND version = :version', { id, version: dto.version })
      .returning('*');


    const res = await qb.execute();
    if (res.affected === 0) {
      const current = await this.repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Travel plan not found');

      throw new ConflictException({
        error: 'Conflict: entity was modified by another request',
        current_version: current.version,
      });
    }

    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) {
      throw new NotFoundException('Travel plan not found');
    }

    this.logger.debug(`Travel plan updated id=${id} newVersion=${updated.version}`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    this.logger.debug(`Removing travel plan id=${id}`);
    const res = await this.repo.delete({ id });
    if (res.affected === 0) throw new NotFoundException('Travel plan not found');
    this.logger.debug(`Travel plan removed id=${id}`);
  }
}

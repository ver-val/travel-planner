import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TravelPlan } from './travel-plan.entity';
import { Location } from '../locations/location.entity';
import {
  CreateTravelPlanDto,
  UpdateTravelPlanDto,
} from './dto/create-travel-plan.dto';
import { NumericColumnTransformer } from '../common/transformers/numeric.transformer';
import { ShardingService } from '../common/sharding/sharding.service';

@Injectable()
export class TravelPlansService {
  private readonly logger = new Logger(TravelPlansService.name);
  private readonly numericTransformer = new NumericColumnTransformer();

  constructor(private readonly sharding: ShardingService) {}

  async list(page = 1, limit = 10) {
    const repos = await this.sharding.getAllPlanRepositories();
    const aggregated: TravelPlan[] = [];

    for (const { repo, shardKey } of repos) {
      const items = await repo.find({ order: { updated_at: 'DESC' } });
      this.logger.debug(
        `Fetched ${items.length} plans from shard=${shardKey} for listing`,
      );
      aggregated.push(...items);
    }

    aggregated.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

    const total = aggregated.length;
    const start = (page - 1) * limit;
    const items = aggregated.slice(start, start + limit);

    return { items, total, page, limit };
  }

  async create(dto: CreateTravelPlanDto): Promise<TravelPlan> {
    this.logger.debug(`Creating travel plan title=${dto.title}`);

    if (
      dto.start_date &&
      dto.end_date &&
      new Date(dto.end_date) < new Date(dto.start_date)
    ) {
      throw new BadRequestException({
        error: 'Validation error',
        details: 'End date must be after start date',
      });
    }

    const id = randomUUID();
    const { planRepo, shardKey } = await this.sharding.getRepositoriesForPlan(
      id,
    );

    const plan = planRepo.create({ ...dto, id });
    const saved = await planRepo.save(plan);

    this.logger.debug(`Travel plan created id=${saved.id} shard=${shardKey}`);
    return saved;
  }

  async get(id: string): Promise<TravelPlan & { locations: Location[] }> {
    const { planRepo, shardKey } = await this.sharding.getRepositoriesForPlan(
      id,
    );
    this.logger.debug(`Fetching travel plan id=${id} shard=${shardKey}`);

    const plan = await planRepo.findOne({
      where: { id },
      relations: ['locations'],
    });

    if (!plan) {
      throw new NotFoundException('Travel plan not found');
    }

    plan.locations = (plan.locations ?? []).sort(
      (a, b) => (a.visit_order ?? 0) - (b.visit_order ?? 0),
    );

    return plan;
  }

  async update(id: string, dto: UpdateTravelPlanDto): Promise<TravelPlan> {
    const { planRepo, shardKey } = await this.sharding.getRepositoriesForPlan(
      id,
    );
    this.logger.debug(
      `Updating travel plan id=${id} shard=${shardKey} version=${dto.version}`,
    );

    if (dto.version === undefined) {
      throw new BadRequestException({
        error: 'Validation error',
        details: 'Version is required',
      });
    }

    if (dto.start_date !== undefined || dto.end_date !== undefined) {
      const current = await planRepo.findOne({
        where: { id },
        select: ['start_date', 'end_date'],
      });

      if (!current) {
        throw new NotFoundException('Travel plan not found');
      }

      const nextStart =
        dto.start_date !== undefined ? dto.start_date : current.start_date;

      const nextEnd =
        dto.end_date !== undefined ? dto.end_date : current.end_date;

      if (nextStart && nextEnd && new Date(nextEnd) < new Date(nextStart)) {
        throw new BadRequestException({
          error: 'Validation error',
          details: 'End date must be after start date',
        });
      }
    }

    const updatePayload: Partial<TravelPlan> = {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.start_date !== undefined && { start_date: dto.start_date }),
      ...(dto.end_date !== undefined && { end_date: dto.end_date }),
      ...(dto.budget !== undefined && { budget: dto.budget }),
      ...(dto.currency !== undefined && { currency: dto.currency }),
      ...(dto.is_public !== undefined && { is_public: dto.is_public }),
    };

    const qb = planRepo
      .createQueryBuilder()
      .update(TravelPlan)
      .set({
        ...updatePayload,
        version: () => '"version" + 1',
      })
      .where('id = :id AND version = :version', {
        id,
        version: dto.version,
      })
      .returning('*');

    const result = await qb.execute();

    // No rows affected = optimistic conflict
    if (result.affected === 0) {
      const current = await planRepo.findOne({
        where: { id },
        select: ['id', 'version'],
      });

      if (!current) {
        throw new NotFoundException('Travel plan not found');
      }

      throw new ConflictException({
        error: 'Conflict: entity was modified by another request',
        current_version: current.version,
      });
    }

    const updatedRaw = result.raw[0];

    if (!updatedRaw) {
      throw new NotFoundException('Travel plan not found after update');
    }

    const updated: TravelPlan = {
      ...updatedRaw,
      ...(updatedRaw.budget !== undefined && {
        budget:
          typeof updatedRaw.budget === 'string'
            ? this.numericTransformer.from(updatedRaw.budget)
            : updatedRaw.budget,
      }),
    };

    this.logger.debug(
      `Travel plan updated id=${id} shard=${shardKey} newVersion=${updated.version}`,
    );

    return updated;
  }

  async remove(id: string): Promise<void> {
    const { planRepo, shardKey } = await this.sharding.getRepositoriesForPlan(
      id,
    );
    this.logger.debug(`Removing travel plan id=${id} shard=${shardKey}`);

    await planRepo.manager.transaction(async (manager) => {
      const res = await manager.delete(TravelPlan, { id });
      if (res.affected === 0) {
        throw new NotFoundException('Travel plan not found');
      }
    });

    this.logger.debug(`Travel plan removed id=${id} shard=${shardKey}`);
  }

  async removeAll(): Promise<void> {
    this.logger.debug(`Removing ALL travel plans across shards`);

    const repos = await this.sharding.getAllPlanRepositories();
    for (const { repo, shardKey } of repos) {
      await repo.manager.transaction(async (manager) => {
        await manager.delete(TravelPlan, {});
      });
      this.logger.debug(`Removed travel plans from shard=${shardKey}`);
    }

    this.logger.debug(`All travel plans removed`);
  }
}

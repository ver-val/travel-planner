import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { CreateLocationDto, UpdateLocationDto } from './dto/create-location.dto';
import { ShardingService } from '../common/sharding/sharding.service';
import { Location } from './location.entity';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(private readonly sharding: ShardingService) {}

  async create(
    travel_plan_id: string,
    dto: CreateLocationDto,
  ): Promise<Location> {
    this.logger.debug(`Creating location for plan=${travel_plan_id}`);
    if (
      dto.arrival_date &&
      dto.departure_date &&
      new Date(dto.departure_date) < new Date(dto.arrival_date)
    ) {
      throw new BadRequestException({
        error: 'Validation error',
        details: 'Departure date must be after arrival date',
      });
    }

    const { planRepo, locationRepo, shardKey } =
      await this.sharding.getRepositoriesForPlan(travel_plan_id);

    const planExists = await planRepo.count({
      where: { id: travel_plan_id },
    });
    if (!planExists) {
      this.logger.warn(
        `Travel plan not found for location create, plan=${travel_plan_id}`,
      );
      throw new NotFoundException('Travel plan not found');
    }

    const count = await locationRepo.count({ where: { travel_plan_id } });

    const entity = locationRepo.create({
      ...dto,
      travel_plan_id,
      visit_order: dto.visit_order ?? count + 1,
    });

    try {
      const saved = await locationRepo.save(entity);
      this.logger.debug(
        `Location created id=${saved.id} plan=${travel_plan_id} shard=${shardKey}`,
      );
      return saved;
    } catch (e: any) {
      const msg = String(e?.message || '');
      const code = e?.code || e?.driverError?.code;
      this.logger.error(
        `Failed to create location for plan=${travel_plan_id}: ${msg}`,
        e?.stack,
      );
      if (code === '23503' || msg.includes('foreign key')) {
        throw new NotFoundException('Travel plan not found');
      }
      if (code === '23505' || msg.includes('unique')) {
        throw new ConflictException({
          error: 'Order conflict. Please retry.',
        });
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateLocationDto): Promise<Location> {
    this.logger.debug(`Updating location id=${id}`);
    if (
      dto.arrival_date &&
      dto.departure_date &&
      new Date(dto.departure_date) < new Date(dto.arrival_date)
    ) {
      throw new BadRequestException({
        error: 'Validation error',
        details: 'Departure date must be after arrival date',
      });
    }

    const located = await this.sharding.findLocationById(id);
    if (!located) {
      throw new NotFoundException('Location not found');
    }

    const { repo, location, shardKey } = located;

    if (dto.version === undefined) {
      throw new BadRequestException({
        error: 'Validation error',
        details: 'Version is required',
      });
    }

    if (location.version !== dto.version) {
      this.logger.warn(
        `Version mismatch for location id=${id}: expected=${location.version} provided=${dto.version}`,
      );
      throw new ConflictException({
        error: 'Conflict: entity was modified by another request',
        current_version: location.version,
      });
    }

    const { version: _version, ...rest } = dto;
    Object.assign(location, rest);

    try {
      const saved = await repo.save(location);
      this.logger.debug(`Location updated id=${id} shard=${shardKey}`);
      return saved;
    } catch (e: any) {
      const msg = String(e?.message || '');
      const code = e?.code || e?.driverError?.code;
      this.logger.error(`Failed to update location id=${id}: ${msg}`, e?.stack);
      if (code === '23505' || msg.includes('unique')) {
        throw new ConflictException({
          error: 'Order conflict. Please retry.',
        });
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.debug(`Removing location id=${id}`);
    const located = await this.sharding.findLocationById(id);
    if (!located) {
      throw new NotFoundException('Location not found');
    }

    const res = await located.repo.delete({ id });
    if (res.affected === 0) {
      throw new NotFoundException('Location not found');
    }
    this.logger.debug(`Location removed id=${id} shard=${located.shardKey}`);
  }
}

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from './location.entity';
import { CreateLocationDto, UpdateLocationDto } from './dto/create-location.dto';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location) private readonly repo: Repository<Location>,
  ) {}

 async create(travel_plan_id: string, dto: CreateLocationDto): Promise<Location> {
  if (dto.arrival_date && dto.departure_date && new Date(dto.departure_date) < new Date(dto.arrival_date)) {
    throw new ConflictException('Departure date must be after arrival date');
  }

  const count = await this.repo.count({ where: { travel_plan_id } });

  const entity = this.repo.create({
    ...dto,
    travel_plan_id,
    latitude: dto.latitude !== undefined ? dto.latitude.toString() : undefined,
    longitude: dto.longitude !== undefined ? dto.longitude.toString() : undefined,
    budget: dto.budget !== undefined ? dto.budget : undefined,
    visit_order: count + 1,
  });

  try {
    return await this.repo.save(entity);
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('violates foreign key')) {
      throw new NotFoundException('Travel plan not found');
    }
    if (msg.includes('unique')) {
      throw new ConflictException('Order conflict. Please retry.');
    }
    throw e;
  }
}

  async update(id: string, dto: UpdateLocationDto): Promise<Location> {
    if (dto.arrival_date && dto.departure_date && new Date(dto.departure_date) < new Date(dto.arrival_date)) {
      throw new ConflictException('Departure date must be after arrival date');
    }

    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Location not found');

    Object.assign(existing, dto);

    try {
      return await this.repo.save(existing);
    } catch (e: any) {
      if (String(e?.message || '').includes('unique')) {
        throw new ConflictException('Order conflict. Please retry.');
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete({ id });
    if (res.affected === 0) throw new NotFoundException('Location not found');
  }
}

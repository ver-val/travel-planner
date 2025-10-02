import { Test, TestingModule } from '@nestjs/testing';
import { TravelPlansService } from '../travel-plans.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TravelPlan } from '../travel-plan.entity';
import { Location } from '../../locations/location.entity';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

const mockTravelPlanRepo = () => ({
  findAndCount: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
  delete: jest.fn(),
});

const mockLocationRepo = () => ({});

describe('TravelPlansService', () => {
  let service: TravelPlansService;
  let repo: jest.Mocked<Repository<TravelPlan>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TravelPlansService,
        { provide: getRepositoryToken(TravelPlan), useFactory: mockTravelPlanRepo },
        { provide: getRepositoryToken(Location), useFactory: mockLocationRepo },
      ],
    }).compile();

    service = module.get<TravelPlansService>(TravelPlansService);
    repo = module.get(getRepositoryToken(TravelPlan));
  });

  describe('create()', () => {
    it('should create a travel plan successfully', async () => {
      const dto = { title: 'Trip', budget: 1000 };
      const plan = { id: 'uuid', ...dto };
      repo.create.mockReturnValue(plan as any);
      repo.save.mockResolvedValue(plan as any);

      const result = await service.create(dto as any);
      expect(result).toEqual(plan);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining(dto));
      expect(repo.save).toHaveBeenCalled();
    });

    it('should throw if end_date is before start_date', async () => {
      await expect(
        service.create({ start_date: '2025-06-10', end_date: '2025-06-01' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('get()', () => {
    it('should return a travel plan with sorted locations', async () => {
      repo.findOne.mockResolvedValue({
        id: '1',
        locations: [{ visit_order: 2 }, { visit_order: 1 }],
      } as any);

      const result = await service.get('1');
      expect(result.locations[0].visit_order).toBe(1);
      expect(result.locations[1].visit_order).toBe(2);
    });

    it('should throw NotFoundException if plan is not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.get('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('should update a travel plan when version matches', async () => {
      const qb: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1, raw: [{ id: '1', version: 2 }] }),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      repo.findOne.mockResolvedValue({ id: '1', version: 2 } as any);

      const result = await service.update('1', { version: 1, title: 'New Title' } as any);
      expect(result.version).toBe(2);
    });

    it('should throw ConflictException if version mismatch occurs', async () => {
      const qb: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      repo.findOne.mockResolvedValue({ version: 2 } as any);

      await expect(service.update('1', { version: 1 } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('remove()', () => {
    it('should delete a travel plan successfully', async () => {
      repo.delete.mockResolvedValue({ affected: 1 } as any);
      await expect(service.remove('1')).resolves.not.toThrow();
    });

    it('should throw NotFoundException if travel plan does not exist', async () => {
      repo.delete.mockResolvedValue({ affected: 0 } as any);
      await expect(service.remove('404')).rejects.toThrow(NotFoundException);
    });
  });
});

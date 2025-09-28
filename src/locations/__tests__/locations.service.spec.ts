import { Test, TestingModule } from '@nestjs/testing';
import { LocationsService } from '../locations.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../location.entity';
import { NotFoundException, ConflictException } from '@nestjs/common';

const mockLocationRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  delete: jest.fn(),
});

describe('LocationsService', () => {
  let service: LocationsService;
  let repo: jest.Mocked<Repository<Location>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: getRepositoryToken(Location), useFactory: mockLocationRepo },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
    repo = module.get(getRepositoryToken(Location));
  });

  describe('create()', () => {
    it('should create a location successfully', async () => {
      const dto = { name: 'Paris' };
      const location = { id: 'uuid', ...dto };

      repo.create.mockReturnValue(location as any);
      repo.save.mockResolvedValue(location as any);

      const result = await service.create('plan-id', dto as any);
      expect(result).toEqual(location);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ travel_plan_id: 'plan-id' }),
      );
    });

    it('should throw if departure_date is before arrival_date', async () => {
      await expect(
        service.create('plan', {
          name: 'Paris',
          arrival_date: '2025-06-05',
          departure_date: '2025-06-01',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if foreign key constraint fails', async () => {
      repo.create.mockReturnValue({} as any);
      repo.save.mockRejectedValue(new Error('violates foreign key'));
      await expect(service.create('bad', { name: 'Rome' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('should update a location successfully', async () => {
      repo.findOne.mockResolvedValue({ id: 'loc1' } as any);
      repo.save.mockResolvedValue({ id: 'loc1', name: 'Updated' } as any);

      const result = await service.update('loc1', { name: 'Updated' } as any);
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException if location is not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update('bad', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove()', () => {
    it('should delete a location successfully', async () => {
      repo.delete.mockResolvedValue({ affected: 1 } as any);
      await expect(service.remove('loc')).resolves.not.toThrow();
    });

    it('should throw NotFoundException if location does not exist', async () => {
      repo.delete.mockResolvedValue({ affected: 0 } as any);
      await expect(service.remove('bad')).rejects.toThrow(NotFoundException);
    });
  });
});

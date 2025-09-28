import { Controller, Post, Put, Delete, Param, Body, ParseUUIDPipe, HttpCode } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CreateLocationDto, UpdateLocationDto } from './dto/create-location.dto';

@ApiTags('locations')
@Controller()
export class LocationsController {
  constructor(private readonly service: LocationsService) {}

  @Post('travel-plans/:planId/locations')
  async create(@Param('planId', new ParseUUIDPipe({ version: '4' })) planId: string, @Body() dto: CreateLocationDto) {
    return this.service.create(planId, dto as any);
  }

  @Put('locations/:id')
  async update(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateLocationDto) {
    return this.service.update(id, dto as any);
  }

  @Delete('locations/:id')
  @HttpCode(204)
  async delete(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    await this.service.remove(id);
    return;
  }
}

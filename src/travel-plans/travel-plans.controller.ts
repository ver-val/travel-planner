import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { TravelPlansService } from './travel-plans.service';
import { CreateTravelPlanDto, UpdateTravelPlanDto } from './dto/create-travel-plan.dto';
import { UuidPipe } from '../common/pipes/uuid.pipe';

@ApiTags('travel-plans')
@Controller('travel-plans')
export class TravelPlansController {
  constructor(private readonly service: TravelPlansService) {}

  @Get()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(@Query('page') page = 1, @Query('limit') limit = 10) {
    return this.service.list(+page, +limit);
  }

  @Post()
  async create(@Body() dto: CreateTravelPlanDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  async get(
    @Param('id', new UuidPipe())
    id: string,
  ) {
    return this.service.get(id);
  }

  @Put(':id')
  async update(
    @Param('id', new UuidPipe())
    id: string,
    @Body() dto: UpdateTravelPlanDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiResponse({ status: 204 })
  @HttpCode(204)
  async remove(@Param('id', new UuidPipe()) id: string): Promise<void> {
    await this.service.remove(id);
  }
}

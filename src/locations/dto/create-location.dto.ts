import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsDefined, IsInt, IsNumber, IsOptional, IsPositive, IsString, Matches, MaxLength, Min, Max } from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({ maxLength: 200 })
  @IsDefined({ message: 'Name is required' })
  @IsString()
  @MaxLength(200, { message: 'Name must be at most 200 characters' })
  @Matches(/.*\S.*/, { message: 'Name is required' })
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 48.8584 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  latitude?: number;

  @ApiPropertyOptional({ example: 2.2945 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  longitude?: number;

  @ApiPropertyOptional({ description: 'Optional order; auto-assigned if omitted' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  visit_order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  arrival_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  departure_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Budget must be positive' })
  budget?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateLocationDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Name must be at most 200 characters' })
  @Matches(/(^$)|(^.*\S.*$)/, { message: 'Name cannot be empty' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  arrival_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  departure_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Budget must be positive' })
  budget?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Current location version for optimistic locking' })
  @IsDefined({ message: 'Version is required' })
  @Type(() => Number)
  @IsInt({ message: 'Version must be an integer' })
  @IsPositive({ message: 'Version must be positive' })
  version!: number;
}

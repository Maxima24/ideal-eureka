import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProfileService } from './profile.service';

@Controller('api/profiles')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createProfile(@Body('name') name: unknown) {
    return this.profileService.createProfile(name);
  }

  @Get()
  getAllProfiles(
    @Query('gender') gender?: string,
    @Query('country_id') country_id?: string,
    @Query('age_group') age_group?: string,
  ) {
    return this.profileService.getAllProfiles({ gender, country_id, age_group });
  }

  @Get(':id')
  getProfileById(@Param('id') id: string) {
    return this.profileService.getProfileById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProfile(@Param('id') id: string) {
    return this.profileService.deleteProfile(id);
  }
}
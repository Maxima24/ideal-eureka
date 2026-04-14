import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ProfileService } from './profile.service';

@Controller('api/profiles')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProfile(@Body() body: { name: string }) {
    return this.profileService.createProfile(body?.name);
  }
}
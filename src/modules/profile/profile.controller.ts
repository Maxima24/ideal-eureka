import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ProfilesService,
  ProfilesQueryDto,
  NLQueryDto,
} from './profile.service';

@Controller('api/profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  /**
   * GET /api/profiles
   * Advanced filtering + sorting + pagination
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() query: ProfilesQueryDto, @Res() res: Response) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const result = await this.profilesService.findAll(query);
    return res.json(result);
  }


  @Get('search')
  @HttpCode(HttpStatus.OK)
  async search(@Query() query: NLQueryDto, @Res() res: Response) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const result = await this.profilesService.search(query);

    // NL parse failure returns a 200 with status:error per spec
    return res.json(result);
  }
}
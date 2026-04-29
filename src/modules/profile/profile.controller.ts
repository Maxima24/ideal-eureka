import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Res,
  Req,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ProfilesService } from './profile.service';
import { Roles } from "../../common/decorators/role.decorator"

@Controller('api/profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  // ─── List profiles (filtering, sorting, pagination) ──────────────────────────
  @Get()
  async findAll(@Query() query: any, @Req() req: Request) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 10));

    const filters = {
      gender: query.gender,
      age_group: query.age_group,
      country_id: query.country_id,
      min_age: query.min_age ? parseInt(query.min_age) : undefined,
      max_age: query.max_age ? parseInt(query.max_age) : undefined,
      min_gender_probability: query.min_gender_probability
        ? parseFloat(query.min_gender_probability)
        : undefined,
      min_country_probability: query.min_country_probability
        ? parseFloat(query.min_country_probability)
        : undefined,
    };

    const sort = {
      sort_by: query.sort_by,
      order: query.order,
    };

    const { data, total } = await this.profilesService.findAll({
      filters,
      sort,
      page,
      limit,
    });

    const total_pages = Math.ceil(total / limit);
    const baseUrl = `/api/profiles`;
    const buildUrl = (p: number) => {
      const params = new URLSearchParams({ ...query, page: String(p), limit: String(limit) });
      return `${baseUrl}?${params.toString()}`;
    };

    return {
      status: 'success',
      page,
      limit,
      total,
      total_pages,
      links: {
        self: buildUrl(page),
        next: page < total_pages ? buildUrl(page + 1) : null,
        prev: page > 1 ? buildUrl(page - 1) : null,
      },
      data,
    };
  }

  // ─── Export CSV ───────────────────────────────────────────────────────────────
  @Get('export')
  async exportCsv(@Query() query: any, @Res() res: Response) {
    if (query.format !== 'csv') {
      throw new BadRequestException({ status: 'error', message: 'Supported format: csv' });
    }

    const filters = {
      gender: query.gender,
      age_group: query.age_group,
      country_id: query.country_id,
      min_age: query.min_age ? parseInt(query.min_age) : undefined,
      max_age: query.max_age ? parseInt(query.max_age) : undefined,
    };

    const sort = {
      sort_by: query.sort_by,
      order: query.order,
    };

    const profiles = await this.profilesService.findAllForExport({ filters, sort });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `profiles_${timestamp}.csv`;

    const headers = [
      'id',
      'name',
      'gender',
      'gender_probability',
      'age',
      'age_group',
      'country_id',
      'country_name',
      'country_probability',
      'created_at',
    ];

    const rows = profiles.map((p) =>
      [
        p.id,
        `"${p.name}"`,
        p.gender ?? '',
        p.gender_probability ?? '',
        p.age ?? '',
        p.age_group ?? '',
        p.country_id ?? '',
        `"${p.country_name ?? ''}"`,
        p.country_probability ?? '',
        p.created_at.toISOString(),
      ].join(','),
    );

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  }

  // ─── Natural language search ──────────────────────────────────────────────────
  @Get('search')
  async search(@Query() query: any) {
    const q = query.q;
    if (!q) {
      throw new BadRequestException({ status: 'error', message: 'Query parameter q is required' });
    }

    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 10));

    const { data, total, filters } = await this.profilesService.search({ q, page, limit });

    if (!filters) {
      return { status: 'error', message: 'Unable to interpret query' };
    }

    const total_pages = Math.ceil(total / limit);
    const buildUrl = (p: number) =>
      `/api/profiles/search?q=${encodeURIComponent(q)}&page=${p}&limit=${limit}`;

    return {
      status: 'success',
      page,
      limit,
      total,
      total_pages,
      links: {
        self: buildUrl(page),
        next: page < total_pages ? buildUrl(page + 1) : null,
        prev: page > 1 ? buildUrl(page - 1) : null,
      },
      data,
    };
  }

  // ─── Get single profile ────────────────────────────────────────────────────────
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const profile = await this.profilesService.findOne(id);
    if (!profile) {
      throw new NotFoundException({ status: 'error', message: 'Profile not found' });
    }
    return { status: 'success', data: profile };
  }

  // ─── Create profile (admin only) ──────────────────────────────────────────────
  @Post()
  @Roles('admin')
  async create(@Body() body: { name: string }) {
    if (!body.name?.trim()) {
      throw new BadRequestException({ status: 'error', message: 'Name is required' });
    }
    const profile = await this.profilesService.create(body.name.trim());
    return { status: 'success', data: profile };
  }

  // ─── Delete profile (admin only) ─────────────────────────────────────────────
  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string) {
    const profile = await this.profilesService.findOne(id);
    if (!profile) {
      throw new NotFoundException({ status: 'error', message: 'Profile not found' });
    }
    await this.profilesService.remove(id);
    return { status: 'success', message: 'Profile deleted' };
  }
}
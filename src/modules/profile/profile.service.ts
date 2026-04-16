import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v7 as uuidv7 } from 'uuid';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async createProfile(name: unknown) {
    if (name === undefined || name === null || name === '') {
      throw new BadRequestException({
        status: 'error',
        message: 'name is required',
      });
    }

    if (typeof name !== 'string') {
      throw new UnprocessableEntityException({
        status: 'error',
        message: 'name must be a string',
      });
    }

    const trimmedName = name.trim().toLowerCase();

    if (trimmedName === '') {
      throw new BadRequestException({
        status: 'error',
        message: 'name cannot be empty',
      });
    }

    const existing = await this.prisma.profile.findUnique({
      where: { name: trimmedName },
    });

    if (existing) {
      return {
        status: 'success',
        message: 'Profile already exists',
        data: this.formatResponse(existing),
      };
    }

    const [genderizeData, agifyData, nationalizeData] =
      await this.fetchExternalApis(trimmedName);

    if (!genderizeData.gender || genderizeData.count === 0) {
      throw new HttpException(
        { status: 'error', message: 'Genderize returned an invalid response' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (agifyData.age === null || agifyData.age === undefined) {
      throw new HttpException(
        { status: 'error', message: 'Agify returned an invalid response' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!nationalizeData.country || nationalizeData.country.length === 0) {
      throw new HttpException(
        { status: 'error', message: 'Nationalize returned an invalid response' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const topCountry = nationalizeData.country.reduce(
      (prev: any, curr: any) =>
        curr.probability > prev.probability ? curr : prev,
    );

    const saved = await this.prisma.profile.create({
      data: {
        id: uuidv7(),
        name: trimmedName,
        gender: genderizeData.gender,
        gender_probability: genderizeData.probability,
        sample_size: genderizeData.count,
        age: agifyData.age,
        age_group: this.classifyAgeGroup(agifyData.age),
        country_id: topCountry.country_id,
        country_probability: topCountry.probability,
      },
    });

    return {
      status: 'success',
      data: this.formatResponse(saved),
    };
  }

  async getProfileById(id: string) {
    const profile = await this.prisma.profile.findUnique({ where: { id } });

    if (!profile) {
      throw new NotFoundException({
        status: 'error',
        message: 'Profile not found',
      });
    }

    return {
      status: 'success',
      data: this.formatResponse(profile),
    };
  }

  async getAllProfiles(filters: {
    gender?: string;
    country_id?: string;
    age_group?: string;
  }) {
    const where: Record<string, any> = {};

    if (filters.gender) {
      where.gender = filters.gender.toLowerCase();
    }

    if (filters.country_id) {
      where.country_id = filters.country_id.toLowerCase();
    }

    if (filters.age_group) {
      where.age_group = filters.age_group.toLowerCase();
    }

    const profiles = await this.prisma.profile.findMany({ where });

    return {
      status: 'success',
      count: profiles.length,
      data: profiles.map((p) => ({
        id: p.id,
        name: p.name,
        gender: p.gender,
        age: p.age,
        age_group: p.age_group,
        country_id: p.country_id,
      })),
    };
  }

  async deleteProfile(id: string) {
    const profile = await this.prisma.profile.findUnique({ where: { id } });

    if (!profile) {
      throw new NotFoundException({
        status: 'error',
        message: 'Profile not found',
      });
    }

    await this.prisma.profile.delete({ where: { id } });
  }

  private async fetchExternalApis(name: string) {
    const encodedName = encodeURIComponent(name);

    try {
      const [genderizeRes, agifyRes, nationalizeRes] = await Promise.all([
        fetch(`https://api.genderize.io?name=${encodedName}`),
        fetch(`https://api.agify.io?name=${encodedName}`),
        fetch(`https://api.nationalize.io?name=${encodedName}`),
      ]);

      const [genderizeData, agifyData, nationalizeData] = await Promise.all([
        genderizeRes.json(),
        agifyRes.json(),
        nationalizeRes.json(),
      ]);

      return [genderizeData, agifyData, nationalizeData];
    } catch {
      throw new HttpException(
        { status: 'error', message: 'Failed to reach external APIs' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private classifyAgeGroup(age: number): string {
    if (age <= 12) return 'child';
    if (age <= 19) return 'teenager';
    if (age <= 59) return 'adult';
    return 'senior';
  }

  private formatResponse(profile: {
    id: string;
    name: string;
    gender: string;
    gender_probability: number;
    sample_size: number;
    age: number;
    age_group: string;
    country_id: string;
    country_probability: number;
    created_at: Date;
  }) {
    return {
      id: profile.id,
      name: profile.name,
      gender: profile.gender,
      gender_probability: profile.gender_probability,
      sample_size: profile.sample_size,
      age: profile.age,
      age_group: profile.age_group,
      country_id: profile.country_id,
      country_probability: profile.country_probability,
      created_at: profile.created_at,
    };
  }
}
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
// import { parseNaturalLanguage } from './nlp/parser';
import { v7 as uuidv7 } from 'uuid';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}




  
  // ─── Build where clause from filters ─────────────────────────────────────────
  private buildWhereClause(filters: {
    gender?: string;
    age_group?: string;
    country_id?: string;
    min_age?: number;
    max_age?: number;
    min_gender_probability?: number;
    min_country_probability?: number;
  }) {
    const where: any = {};

    if (filters.gender) where.gender = filters.gender;
    if (filters.age_group) where.age_group = filters.age_group;
    if (filters.country_id) where.country_id = filters.country_id.toUpperCase();

    if (filters.min_age !== undefined || filters.max_age !== undefined) {
      where.age = {};
      if (filters.min_age !== undefined) where.age.gte = filters.min_age;
      if (filters.max_age !== undefined) where.age.lte = filters.max_age;
    }

    if (filters.min_gender_probability !== undefined) {
      where.gender_probability = { gte: filters.min_gender_probability };
    }

    if (filters.min_country_probability !== undefined) {
      where.country_probability = { gte: filters.min_country_probability };
    }

    return where;
  }

  // ─── Build order by ───────────────────────────────────────────────────────────
private buildOrderBy(sort: { sort_by?: string; order?: string }) {
  const allowedFields = ['age', 'created_at', 'gender_probability'] as const;

  type AllowedField = typeof allowedFields[number];

  const field: AllowedField =
    sort?.sort_by && (allowedFields as readonly string[]).includes(sort.sort_by)
      ? (sort.sort_by as AllowedField)
      : 'created_at';

  const direction = sort?.order === 'asc' ? 'asc' : 'desc';

  return { [field]: direction };
}




 parseNaturalLanguage(query: string): Record<string, any> | null {
  const q = query.toLowerCase();
  const filters: Record<string, any> = {};

  if (q.includes('male') && !q.includes('female')) filters.gender = 'male';
  if (q.includes('female')) filters.gender = 'female';
  if (q.includes('child')) filters.age_group = 'child';
  if (q.includes('teen')) filters.age_group = 'teenager';
  if (q.includes('adult')) filters.age_group = 'adult';
  if (q.includes('senior')) filters.age_group = 'senior';

  const countryMatch = q.match(/from ([a-z]+)/i);
  if (countryMatch) {
    const countryMap: Record<string, string> = {
      nigeria: 'NG', ghana: 'GH', kenya: 'KE', usa: 'US',
      'united states': 'US', uk: 'GB', 'united kingdom': 'GB',
    };
    const country = countryMap[countryMatch[1].toLowerCase()];
    if (country) filters.country_id = country;
  }

  const minAgeMatch = q.match(/(?:above|over|older than)\s+(\d+)/);
  const maxAgeMatch = q.match(/(?:below|under|younger than)\s+(\d+)/);
  if (minAgeMatch) filters.min_age = parseInt(minAgeMatch[1]);
  if (maxAgeMatch) filters.max_age = parseInt(maxAgeMatch[1]);

  return Object.keys(filters).length > 0 ? filters : null;
}
  // ─── Find all (paginated) ─────────────────────────────────────────────────────
  async findAll(params: {
    filters: any;
    sort: any;
    page: number;
    limit: number;
  }) {
    const where = this.buildWhereClause(params.filters);
    const orderBy = this.buildOrderBy(params.sort);
    const skip = (params.page - 1) * params.limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.profile.findMany({ where, orderBy, skip, take: params.limit }),
      this.prisma.profile.count({ where }),
    ]);

    return { data, total };
  }

  // ─── Find all for export (no pagination) ─────────────────────────────────────
  async findAllForExport(params: { filters: any; sort: any }) {
    const where = this.buildWhereClause(params.filters);
    const orderBy = this.buildOrderBy(params.sort);
    return this.prisma.profile.findMany({ where, orderBy });
  }

  // ─── Natural language search ──────────────────────────────────────────────────
  async search(params: { q: string; page: number; limit: number }) {
    const filters = this.parseNaturalLanguage(params.q);
    if (!filters) return { data: [], total: 0, filters: null };

    const { data, total } = await this.findAll({
      filters,
      sort: {},
      page: params.page,
      limit: params.limit,
    });

    return { data, total, filters };
  }

  // ─── Find one ─────────────────────────────────────────────────────────────────
  async findOne(id: string) {
    return this.prisma.profile.findUnique({ where: { id } });
  }

  // ─── Create (admin) ───────────────────────────────────────────────────────────
  async create(name: string) {
    // Call external APIs (Stage 1 logic)
    const [genderData, agifyData, nationalizeData] = await Promise.allSettled([
      fetch(`https://api.genderize.io?name=${encodeURIComponent(name)}`).then((r) => r.json()),
      fetch(`https://api.agify.io?name=${encodeURIComponent(name)}`).then((r) => r.json()),
      fetch(`https://api.nationalize.io?name=${encodeURIComponent(name)}`).then((r) => r.json()),
    ]);

    const gender =
      genderData.status === 'fulfilled' ? genderData.value : null;
    const agify =
      agifyData.status === 'fulfilled' ? agifyData.value : null;
    const nationalize =
      nationalizeData.status === 'fulfilled' ? nationalizeData.value : null;

    const topCountry =
      nationalize?.country?.sort((a: any, b: any) => b.probability - a.probability)[0] ?? null;

    const age = agify?.age ?? null;
    const age_group = age
      ? age < 13
        ? 'child'
        : age < 18
        ? 'teenager'
        : age < 60
        ? 'adult'
        : 'senior'
      : null;

    const profile = await this.prisma.profile.create({
      data: {
        id: uuidv7(),
        name,
        gender: gender?.gender ?? null,
        gender_probability: gender?.probability ?? null,
        age,
        ...(age_group && {age_group}),
        country_id: topCountry?.country_id ?? null,
        country_name: topCountry?.country_name, // resolved separately if needed
        country_probability: topCountry?.probability ?? null,
      },
    });

    return profile;
  }

  // ─── Delete (admin) ───────────────────────────────────────────────────────────
  async remove(id: string) {
    return this.prisma.profile.delete({ where: { id } });
  }
}
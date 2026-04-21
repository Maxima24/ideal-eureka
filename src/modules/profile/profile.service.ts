import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface ProfilesQueryDto {
  gender?: string;
  age_group?: string;
  country_id?: string;
  min_age?: string;
  max_age?: string;
  min_gender_probability?: string;
  min_country_probability?: string;
  sort_by?: string;
  order?: string;
  page?: string;
  limit?: string;
}

export interface NLQueryDto {
  q?: string;
  page?: string;
  limit?: string;
}

// ─── Country name → ISO map (extend as needed) ───────────────────────────────

const COUNTRY_MAP: Record<string, string> = {
  nigeria: 'NG',
  ghana: 'GH',
  kenya: 'KE',
  angola: 'AO',
  ethiopia: 'ET',
  tanzania: 'TZ',
  uganda: 'UG',
  senegal: 'SN',
  cameroon: 'CM',
  'ivory coast': 'CI',
  'cote d\'ivoire': 'CI',
  zimbabwe: 'ZW',
  zambia: 'ZM',
  mozambique: 'MZ',
  madagascar: 'MG',
  mali: 'ML',
  niger: 'NE',
  guinea: 'GN',
  benin: 'BJ',
  togo: 'TG',
  rwanda: 'RW',
  burundi: 'BI',
  chad: 'TD',
  somalia: 'SO',
  'south africa': 'ZA',
  egypt: 'EG',
  morocco: 'MA',
  algeria: 'DZ',
  tunisia: 'TN',
  libya: 'LY',
  sudan: 'SD',
  'south sudan': 'SS',
  'democratic republic of congo': 'CD',
  congo: 'CG',
  gabon: 'GA',
  'equatorial guinea': 'GQ',
  'central african republic': 'CF',
  eritrea: 'ER',
  djibouti: 'DJ',
  comoros: 'KM',
  'cape verde': 'CV',
  'sao tome': 'ST',
  seychelles: 'SC',
  mauritius: 'MU',
  mauritania: 'MR',
  'western sahara': 'EH',
  gambia: 'GM',
  'sierra leone': 'SL',
  liberia: 'LR',
  'burkina faso': 'BF',
  malawi: 'MW',
  botswana: 'BW',
  namibia: 'NA',
  lesotho: 'LS',
  swaziland: 'SZ',
  eswatini: 'SZ',
  'guinea-bissau': 'GW',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_SORT_FIELDS = ['age', 'created_at', 'gender_probability'];
const VALID_ORDERS = ['asc', 'desc'];
const VALID_AGE_GROUPS = ['child', 'teenager', 'adult', 'senior'];
const VALID_GENDERS = ['male', 'female'];

function parsePagination(
  page?: string,
  limit?: string,
): { skip: number; take: number; pageNum: number; limitNum: number } {
  const pageNum = page !== undefined ? parseInt(page, 10) : 1;
  const limitNum = limit !== undefined ? parseInt(limit, 10) : 10;

  if (isNaN(pageNum) || isNaN(limitNum)) {
    throw new UnprocessableEntityException('Invalid query parameters');
  }
  if (pageNum < 1 || limitNum < 1 || limitNum > 50) {
    throw new BadRequestException('Invalid query parameters');
  }

  return {
    skip: (pageNum - 1) * limitNum,
    take: limitNum,
    pageNum,
    limitNum,
  };
}

function buildWhereClause(filters: {
  gender?: string;
  age_group?: string;
  country_id?: string;
  min_age?: number;
  max_age?: number;
  min_gender_probability?: number;
  min_country_probability?: number;
}): Prisma.ProfileWhereInput {
  const where: Prisma.ProfileWhereInput = {};

  if (filters.gender !== undefined) {
    if (!VALID_GENDERS.includes(filters.gender)) {
      throw new BadRequestException('Invalid query parameters');
    }
    where.gender = filters.gender;
  }

  if (filters.age_group !== undefined) {
    if (!VALID_AGE_GROUPS.includes(filters.age_group)) {
      throw new BadRequestException('Invalid query parameters');
    }
    where.age_group = filters.age_group;
  }

  if (filters.country_id !== undefined) {
    where.country_id = filters.country_id.toUpperCase();
  }

  if (filters.min_age !== undefined || filters.max_age !== undefined) {
    where.age = {};
    if (filters.min_age !== undefined) {
      (where.age as Prisma.IntFilter).gte = filters.min_age;
    }
    if (filters.max_age !== undefined) {
      (where.age as Prisma.IntFilter).lte = filters.max_age;
    }
  }

  if (filters.min_gender_probability !== undefined) {
    where.gender_probability = { gte: filters.min_gender_probability };
  }

  if (filters.min_country_probability !== undefined) {
    where.country_probability = { gte: filters.min_country_probability };
  }

  return where;
}

// ─── Natural Language Parser ─────────────────────────────────────────────────

interface ParsedNLQuery {
  gender?: string;
  age_group?: string;
  country_id?: string;
  min_age?: number;
  max_age?: number;
}

function parseNaturalLanguageQuery(q: string): ParsedNLQuery | null {
  const lower = q.toLowerCase().trim();

  if (!lower) return null;

  const result: ParsedNLQuery = {};

  // ── Gender ──────────────────────────────────────────────────────────────
  if (/\bmales?\b/.test(lower) && !/\bfemales?\b/.test(lower)) {
    result.gender = 'male';
  } else if (/\bfemales?\b/.test(lower) && !/\bmales?\b/.test(lower)) {
    result.gender = 'female';
  }
  // "male and female" → no gender filter (both)

  // ── Age group ────────────────────────────────────────────────────────────
  if (/\bchildren\b|\bchild\b/.test(lower)) {
    result.age_group = 'child';
  } else if (/\bteenagers?\b/.test(lower)) {
    result.age_group = 'teenager';
  } else if (/\badults?\b/.test(lower)) {
    result.age_group = 'adult';
  } else if (/\bseniors?\b|\belderly\b|\bold people\b/.test(lower)) {
    result.age_group = 'senior';
  } else if (/\byoung\b/.test(lower)) {
    // "young" → 16–24 (not a stored age_group, parsed as age range)
    result.min_age = 16;
    result.max_age = 24;
  }

  // ── Explicit age expressions ─────────────────────────────────────────────
  // "above 30" / "over 30" / "older than 30"
  const aboveMatch = lower.match(/\b(?:above|over|older than|greater than|more than)\s+(\d+)/);
  if (aboveMatch) {
    result.min_age = parseInt(aboveMatch[1], 10);
    // clear "young" range if explicit age provided
    if (result.max_age === 24 && result.min_age > 16) {
      delete result.max_age;
    }
  }

  // "below 20" / "under 20" / "younger than 20"
  const belowMatch = lower.match(/\b(?:below|under|younger than|less than)\s+(\d+)/);
  if (belowMatch) {
    result.max_age = parseInt(belowMatch[1], 10);
  }

  // "between 20 and 30"
  const betweenMatch = lower.match(/\bbetween\s+(\d+)\s+and\s+(\d+)/);
  if (betweenMatch) {
    result.min_age = parseInt(betweenMatch[1], 10);
    result.max_age = parseInt(betweenMatch[2], 10);
  }

  // ── Country ──────────────────────────────────────────────────────────────
  // Match "from <country>" or "in <country>"
  const fromMatch = lower.match(/\b(?:from|in)\s+([a-z\s'-]+?)(?:\s+(?:above|below|over|under|between|and|$)|$)/);
  if (fromMatch) {
    const countryRaw = fromMatch[1].trim().replace(/\s+$/, '');

    // Try multi-word first, then single word
    if (COUNTRY_MAP[countryRaw]) {
      result.country_id = COUNTRY_MAP[countryRaw];
    } else {
      // Try matching last word(s) progressively
      const words = countryRaw.split(' ');
      for (let i = 0; i < words.length; i++) {
        const attempt = words.slice(i).join(' ');
        if (COUNTRY_MAP[attempt]) {
          result.country_id = COUNTRY_MAP[attempt];
          break;
        }
      }
    }

    // If still not found, try ISO code directly (2-letter uppercase)
    if (!result.country_id) {
      const isoMatch = lower.match(/\b(?:from|in)\s+([a-z]{2})\b/);
      if (isoMatch) {
        result.country_id = isoMatch[1].toUpperCase();
      }
    }
  }

  // ── Validity check ───────────────────────────────────────────────────────
  // If nothing was parsed and query is non-empty, return null → error
  const hasAnything =
    result.gender !== undefined ||
    result.age_group !== undefined ||
    result.country_id !== undefined ||
    result.min_age !== undefined ||
    result.max_age !== undefined;

  if (!hasAnything) return null;

  return result;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ProfilesQueryDto) {
    const {
      gender,
      age_group,
      country_id,
      min_age,
      max_age,
      min_gender_probability,
      min_country_probability,
      sort_by,
      order,
      page,
      limit,
    } = query;

    // ── Pagination ──────────────────────────────────────────────────────────
    const { skip, take, pageNum, limitNum } = parsePagination(page, limit);

    // ── Sorting ─────────────────────────────────────────────────────────────
    let orderBy: Prisma.ProfileOrderByWithRelationInput = { created_at: 'asc' };

    if (sort_by !== undefined) {
      if (!VALID_SORT_FIELDS.includes(sort_by)) {
        throw new BadRequestException('Invalid query parameters');
      }
      const direction = order ?? 'asc';
      if (!VALID_ORDERS.includes(direction)) {
        throw new BadRequestException('Invalid query parameters');
      }
      orderBy = { [sort_by]: direction };
    } else if (order !== undefined) {
      // order provided without sort_by
      throw new BadRequestException('Invalid query parameters');
    }

    // ── Parse numeric filters ────────────────────────────────────────────────
    const parsedMinAge =
      min_age !== undefined ? parseInt(min_age, 10) : undefined;
    const parsedMaxAge =
      max_age !== undefined ? parseInt(max_age, 10) : undefined;
    const parsedMinGenderProb =
      min_gender_probability !== undefined
        ? parseFloat(min_gender_probability)
        : undefined;
    const parsedMinCountryProb =
      min_country_probability !== undefined
        ? parseFloat(min_country_probability)
        : undefined;

    if (
      (min_age !== undefined && isNaN(parsedMinAge!)) ||
      (max_age !== undefined && isNaN(parsedMaxAge!)) ||
      (min_gender_probability !== undefined && isNaN(parsedMinGenderProb!)) ||
      (min_country_probability !== undefined && isNaN(parsedMinCountryProb!))
    ) {
      throw new UnprocessableEntityException('Invalid query parameters');
    }

    // ── Build where ──────────────────────────────────────────────────────────
    const where = buildWhereClause({
      gender,
      age_group,
      country_id,
      min_age: parsedMinAge,
      max_age: parsedMaxAge,
      min_gender_probability: parsedMinGenderProb,
      min_country_probability: parsedMinCountryProb,
    });

    // ── Query ────────────────────────────────────────────────────────────────
    const [total, data] = await this.prisma.$transaction([
      this.prisma.profile.count({ where }),
      this.prisma.profile.findMany({ where, orderBy, skip, take }),
    ]);

    return {
      status: 'success',
      page: pageNum,
      limit: limitNum,
      total,
      data,
    };
  }

  async search(query: NLQueryDto) {
    const { q, page, limit } = query;

    if (!q || q.trim() === '') {
      throw new BadRequestException('Missing or empty parameter');
    }

    // ── Parse NL query ───────────────────────────────────────────────────────
    const parsed = parseNaturalLanguageQuery(q);

    if (!parsed) {
      return { status: 'error', message: 'Unable to interpret query' };
    }

    // ── Pagination ───────────────────────────────────────────────────────────
    const { skip, take, pageNum, limitNum } = parsePagination(page, limit);

    // ── Build where ──────────────────────────────────────────────────────────
    const where = buildWhereClause(parsed);

    // ── Query ────────────────────────────────────────────────────────────────
    const [total, data] = await this.prisma.$transaction([
      this.prisma.profile.count({ where }),
      this.prisma.profile.findMany({ where, skip, take }),
    ]);

    return {
      status: 'success',
      page: pageNum,
      limit: limitNum,
      total,
      data,
    };
  }
}
# Insighta Labs — Queryable Intelligence Engine

A NestJS + PostgreSQL API that supports advanced filtering, sorting, pagination, and natural language querying over a dataset of 2026 demographic profiles.

---

## Stack

- **NestJS** (TypeScript)
- **PostgreSQL** via **Prisma ORM**
- **UUID v7** for all primary keys (generated at seed time via the `uuid` npm package)

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Set up your database URL in .env
DATABASE_URL="postgresql://user:password@host:5432/dbname"

# Run migrations
npx prisma migrate dev

# Seed the database (place profiles.json in prisma/seed/)
pnpm prisma db seed

# Start the server
pnpm start:dev
```

---

## API Endpoints

### `GET /api/profiles`

Returns profiles with support for filtering, sorting, and pagination.

**Filter parameters:**

| Parameter | Type | Description |
|---|---|---|
| `gender` | string | `male` or `female` |
| `age_group` | string | `child`, `teenager`, `adult`, `senior` |
| `country_id` | string | ISO 2-letter code e.g. `NG`, `KE` |
| `min_age` | number | Minimum age (inclusive) |
| `max_age` | number | Maximum age (inclusive) |
| `min_gender_probability` | float | Minimum gender confidence score |
| `min_country_probability` | float | Minimum country confidence score |

**Sorting parameters:**

| Parameter | Values |
|---|---|
| `sort_by` | `age`, `created_at`, `gender_probability` |
| `order` | `asc`, `desc` |

**Pagination parameters:**

| Parameter | Default | Max |
|---|---|---|
| `page` | 1 | — |
| `limit` | 10 | 50 |

**Example:**
```
GET /api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=20
```

**Response format:**
```json
{
  "status": "success",
  "page": 1,
  "limit": 20,
  "total": 142,
  "data": [ ... ]
}
```

---

### `GET /api/profiles/search?q=<query>`

Natural language query endpoint. Accepts plain English and converts it to structured filters.

**Example:**
```
GET /api/profiles/search?q=young males from nigeria
GET /api/profiles/search?q=adult females above 30 from kenya&page=1&limit=10
```

On parse failure:
```json
{ "status": "error", "message": "Unable to interpret query" }
```

---

## Natural Language Parsing

### Approach

The parser is fully rule-based — no AI, no LLMs, no external services. It receives a plain English string, lowercases it, and runs a series of regex patterns against it to extract structured filter values. Each matched pattern writes to a result object that is then passed directly to the same `buildWhereClause` function used by the standard `/api/profiles` endpoint.

The parser runs in this order:
1. Gender detection
2. Age group detection
3. Explicit age expression detection (`above`, `below`, `between`)
4. Country detection via a name-to-ISO map

If nothing is matched after all steps, the parser returns `null` and the endpoint responds with `"Unable to interpret query"`.

---

### Supported Keywords and Mappings

#### Gender

| Query contains | Maps to |
|---|---|
| `male` / `males` (without `female`) | `gender = male` |
| `female` / `females` (without `male`) | `gender = female` |
| `male and female` / both present | No gender filter applied |

#### Age Groups

| Keyword(s) | Maps to |
|---|---|
| `child`, `children` | `age_group = child` |
| `teenager`, `teenagers` | `age_group = teenager` |
| `adult`, `adults` | `age_group = adult` |
| `senior`, `seniors`, `elderly`, `old people` | `age_group = senior` |
| `young` | `min_age = 16`, `max_age = 24` (not a stored age_group — parsed as age range only) |

#### Explicit Age Expressions

These override or extend the "young" range when present.

| Pattern | Example | Maps to |
|---|---|---|
| `above N` / `over N` / `older than N` / `greater than N` / `more than N` | `above 30` | `min_age = 30` |
| `below N` / `under N` / `younger than N` / `less than N` | `under 18` | `max_age = 18` |
| `between N and M` | `between 20 and 40` | `min_age = 20`, `max_age = 40` |

#### Country

The parser matches the pattern `from <country>` or `in <country>` and looks the country name up in a hardcoded name-to-ISO map. Multi-word country names are matched first (e.g. `south africa` before `africa`). If no name match is found, it attempts a direct 2-letter ISO code match.

**Supported country names include (not exhaustive):**
Nigeria, Ghana, Kenya, Tanzania, Uganda, Ethiopia, South Africa, Rwanda, Cameroon, Senegal, Mali, Benin, Ivory Coast / Côte d'Ivoire, Angola, Zambia, Zimbabwe, Mozambique, DR Congo, Congo, Egypt, Morocco, Algeria, Tunisia, Sudan, and ~40 more African countries.

---

### Example Query Mappings

| Query | Parsed filters |
|---|---|
| `young males from nigeria` | `gender=male`, `min_age=16`, `max_age=24`, `country_id=NG` |
| `females above 30` | `gender=female`, `min_age=30` |
| `people from angola` | `country_id=AO` |
| `adult males from kenya` | `gender=male`, `age_group=adult`, `country_id=KE` |
| `male and female teenagers above 17` | `age_group=teenager`, `min_age=17` |
| `seniors under 70 from ghana` | `age_group=senior`, `max_age=70`, `country_id=GH` |
| `children in tanzania` | `age_group=child`, `country_id=TZ` |
| `females between 25 and 40` | `gender=female`, `min_age=25`, `max_age=40` |

---

## Limitations and Known Edge Cases

### 1. No negation support
Queries like `"not from nigeria"` or `"everyone except males"` are not parsed. The parser has no concept of exclusion or negation.

### 2. "Young" conflicts with explicit age expressions
When a query contains both `young` and an `above N` expression (e.g. `"young people above 20"`), the `above` match sets `min_age=20` which may partially override the `young` range. Specifically, `min_age` is overwritten but `max_age=24` from `young` is preserved unless the new `min_age` exceeds it, in which case the result is an impossible range that returns zero records. This is an unhandled edge case.

### 3. Country names must be in the hardcoded map
Only countries explicitly listed in `COUNTRY_MAP` are recognised. Queries mentioning unlisted territories (e.g. `"Western Sahara"`, `"Réunion"`) will fail to extract a country filter and may cause the entire query to return no results or be unrecognised.

### 4. Non-African countries not in the map
The dataset contains profiles from countries like India, France, Brazil, the US, Japan, Germany, the UK, Canada, and Australia. These are not in the `COUNTRY_MAP`, so `"people from france"` will not match a country filter even though French profiles exist.

### 5. Ambiguous country names
Names like `"niger"` (NE) and `"nigeria"` (NG) share a prefix. The parser lowercases and matches whole words, but since Nigeria is listed first in the map iteration order, `"from niger"` could potentially match Nigeria depending on the regex group captured. This is a known ambiguity.

### 6. Typos and misspellings are not handled
There is no fuzzy matching. `"nigerria"` or `"kenia"` will not resolve to any country.

### 7. Multiple countries are not supported
A query like `"males from nigeria or ghana"` is not parsed as a multi-country filter. Only the first matched country phrase is used.

### 8. "Young" is not an age_group in the database
`young` maps to `min_age=16, max_age=24` for parsing purposes only. It does not correspond to any stored `age_group` value in the database. Combining `young` with an explicit age_group keyword like `adult` in the same query will result in both filters being applied simultaneously — which may return zero results since an adult is 20–59 and young is 16–24 (only a small overlap).

### 9. Ordinal and informal age expressions not supported
Phrases like `"in their 30s"`, `"over thirty"` (words not digits), `"middle-aged"`, or `"retirement age"` are not parsed.

### 10. Pagination defaults apply to search
The `page` and `limit` parameters work on `/api/profiles/search` the same way as on `/api/profiles`. If not supplied, defaults of `page=1` and `limit=10` apply. There is no way to disable pagination on the search endpoint.

---

## Error Response Format

All errors follow this structure:

```json
{ "status": "error", "message": "<description>" }
```

| HTTP Status | Meaning |
|---|---|
| 400 | Missing or invalid query parameter |
| 422 | Parameter present but wrong type (e.g. non-numeric age) |
| 404 | Profile not found |
| 500 | Server error |

---

## Performance Notes

- All filter fields (`gender`, `age_group`, `country_id`, `age`) are indexed in the database schema.
- Count and data queries run in a single `$transaction` to ensure accurate pagination totals without race conditions.
- Pagination is enforced at the DB level via `skip`/`take` — no full-table scans for paginated results.
- Maximum `limit` is capped at 50 per request.

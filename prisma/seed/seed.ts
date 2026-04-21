import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';


import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

// ✅ Add adapter setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const adapter = new PrismaPg(pool)

const prisma = new PrismaClient({
  adapter,
})
function getAgeGroup(age: number): string {
  if (age < 13) return 'child';
  if (age < 20) return 'teenager';
  if (age < 60) return 'adult';
  return 'senior';
}

async function main() {
  console.log('🌱 Seeding profiles...');

  // Place profiles.json in the same folder as this seed file (prisma/seed/profiles.json)
  const filePath = path.join(__dirname, 'profiles.json');

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `profiles.json not found at ${filePath}.\nPlease save the JSON data as prisma/seed/profiles.json`,
    );
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);

  // Handle both { profiles: [...] } wrapper and plain array
  const profiles: any[] = Array.isArray(parsed) ? parsed : parsed.profiles;

  if (!profiles || profiles.length === 0) {
    throw new Error('No profiles found in JSON file.');
  }

  console.log(`  Found ${profiles.length} profiles to seed...`);

  let created = 0;
  let skipped = 0;

  const BATCH_SIZE = 100;

  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((p: any) => {
        const age = typeof p.age === 'number' ? p.age : parseInt(p.age, 10);

        return prisma.profile.upsert({
          where: { name: p.name },
          update: {}, // no-op on re-run → idempotent
          create: {
            id: uuidv7(),
            name: p.name,
            gender: p.gender,
            gender_probability: p.gender_probability,
            age,
            age_group: p.age_group ?? getAgeGroup(age),
            country_id: p.country_id,
            country_name: p.country_name,
            country_probability: p.country_probability,
          },
        });
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') created++;
      else {
        skipped++;
        if (skipped <= 5)
          console.error('  Seed error:', (r as PromiseRejectedResult).reason?.message);
      }
    }

    console.log(`  Processed ${Math.min(i + BATCH_SIZE, profiles.length)}/${profiles.length}`);
  }

  console.log(`✅ Done. Created: ${created}, Skipped/failed: ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
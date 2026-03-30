import path from 'path';
import dotenv from 'dotenv';
import {
  createServiceRoleClient,
  fetchRestaurantsForLocationSync,
  syncRestaurantLocation,
} from './lib/restaurant-locations';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

function parseArgs(argv: string[]) {
  const isDryRun = argv.includes('--dry-run');
  const limitArg = argv.find((entry) => entry.startsWith('--limit='))?.split('=')[1];
  const restaurantArg = argv.find((entry) => entry.startsWith('--restaurant='))?.split('=')[1];

  return {
    dryRun: isDryRun,
    limit: limitArg ? Number(limitArg) : undefined,
    restaurant: restaurantArg,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createServiceRoleClient();

  const restaurants = await fetchRestaurantsForLocationSync(supabase, {
    limit: Number.isFinite(args.limit) ? args.limit : undefined,
    restaurantName: args.restaurant,
  });

  console.log(`[location-sync] restaurants with coordinates: ${restaurants.length}`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const restaurant of restaurants) {
    const result = await syncRestaurantLocation(supabase, restaurant, {
      dryRun: args.dryRun,
    });

    if (result.action === 'inserted') inserted += 1;
    if (result.action === 'updated') updated += 1;
    if (result.action === 'skipped') skipped += 1;

    console.log(
      `[location-sync] ${restaurant.name}: ${result.action}` +
      (result.reason ? ` (${result.reason})` : '')
    );
  }

  console.log('[location-sync] summary', {
    mode: args.dryRun ? 'dry-run' : 'live',
    inserted,
    updated,
    skipped,
  });
}

main().catch((error) => {
  console.error('[location-sync] fatal error:', error);
  process.exit(1);
});

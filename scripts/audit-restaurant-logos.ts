import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createAdminClient } from '@/utils/supabase/admin';
import { getLogo } from '@/utils/logos';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type RestaurantRow = {
  name: string;
  logo_url?: string | null;
};

type MenuItemRow = {
  restaurant_name: string | null;
};

type AuditRow = {
  restaurantName: string;
  source: 'db_logo_url' | 'local_logo' | 'default';
  resolvedPath: string;
};

const BATCH_SIZE = 1000;
const showAll = process.argv.includes('--all');
const LOCAL_LOGO_DIR = path.resolve(process.cwd(), 'public', 'logos');

function isUsableRemoteLogo(value?: string | null): value is string {
  return Boolean(
    value &&
      value.startsWith('http') &&
      !value.includes('placeholder')
  );
}

function getLocalPublicPath(logoPath: string): string {
  const relative = logoPath.startsWith('/') ? logoPath.slice(1) : logoPath;
  return path.resolve(process.cwd(), 'public', relative);
}

function normalizeLogoKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\.[^.]+$/, '')
    .replace(/'/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/[_\s]+/g, '')
    .trim();
}

function buildLocalLogoIndex() {
  const index = new Map<string, string>();
  const entries = fs.readdirSync(LOCAL_LOGO_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === 'default.png' || entry.name === 'app_preview.jpg') continue;

    index.set(normalizeLogoKey(entry.name), `/logos/${entry.name}`);
  }

  return index;
}

async function fetchSearchableMealRestaurantNames() {
  const supabase = createAdminClient();
  const restaurantNames = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('menu_items')
      .select('restaurant_name')
      .eq('item_type', 'meal')
      .eq('is_searchable', true)
      .range(from, from + BATCH_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch searchable meal restaurants: ${error.message}`);
    }

    const rows = (data ?? []) as MenuItemRow[];
    for (const row of rows) {
      const name = row.restaurant_name?.trim();
      if (name) {
        restaurantNames.add(name);
      }
    }

    if (rows.length < BATCH_SIZE) {
      break;
    }

    from += rows.length;
  }

  return Array.from(restaurantNames).sort((a, b) => a.localeCompare(b));
}

async function fetchRestaurantLogos() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('restaurants')
    .select('name, logo_url');

  if (error) {
    throw new Error(`Failed to fetch restaurant logos: ${error.message}`);
  }

  const logoMap = new Map<string, string | null | undefined>();

  for (const row of (data ?? []) as RestaurantRow[]) {
    const key = row.name?.trim().toLowerCase();
    if (!key) continue;
    logoMap.set(key, row.logo_url);
  }

  return logoMap;
}

function auditRestaurantLogo(
  restaurantName: string,
  dbLogoUrl: string | null | undefined,
  localLogoIndex: Map<string, string>
): AuditRow {
  if (isUsableRemoteLogo(dbLogoUrl)) {
    return {
      restaurantName,
      source: 'db_logo_url',
      resolvedPath: dbLogoUrl,
    };
  }

  const localLogoPath = getLogo(restaurantName);
  const localPublicPath = getLocalPublicPath(localLogoPath);
  const normalizedResolvedLogo = normalizeLogoKey(path.basename(localLogoPath));
  const indexedLocalLogo = localLogoIndex.get(normalizedResolvedLogo);

  if (localLogoPath !== '/logos/default.png' && fs.existsSync(localPublicPath)) {
    return {
      restaurantName,
      source: 'local_logo',
      resolvedPath: localLogoPath,
    };
  }

  if (indexedLocalLogo) {
    return {
      restaurantName,
      source: 'local_logo',
      resolvedPath: indexedLocalLogo,
    };
  }

  return {
    restaurantName,
    source: 'default',
    resolvedPath: '/logos/default.png',
  };
}

async function main() {
  const [restaurantNames, logoMap] = await Promise.all([
    fetchSearchableMealRestaurantNames(),
    fetchRestaurantLogos(),
  ]);
  const localLogoIndex = buildLocalLogoIndex();

  const auditRows = restaurantNames.map((restaurantName) =>
    auditRestaurantLogo(
      restaurantName,
      logoMap.get(restaurantName.trim().toLowerCase()),
      localLogoIndex
    )
  );

  const defaults = auditRows.filter((row) => row.source === 'default');
  const dbLogos = auditRows.filter((row) => row.source === 'db_logo_url');
  const localLogos = auditRows.filter((row) => row.source === 'local_logo');

  console.log(`Searchable meal-card restaurants audited: ${auditRows.length}`);
  console.log(`Using DB logo_url: ${dbLogos.length}`);
  console.log(`Using local bundled logo: ${localLogos.length}`);
  console.log(`Falling back to default placeholder: ${defaults.length}`);
  console.log('');

  const rowsToPrint = showAll ? auditRows : defaults;

  if (rowsToPrint.length === 0) {
    console.log(showAll ? 'No restaurants found.' : 'No restaurants are using the default placeholder.');
    return;
  }

  for (const row of rowsToPrint) {
    console.log(`${row.source.padEnd(13)} ${row.restaurantName} -> ${row.resolvedPath}`);
  }
}

main().catch((error) => {
  console.error('[audit-restaurant-logos] fatal error:', error);
  process.exit(1);
});

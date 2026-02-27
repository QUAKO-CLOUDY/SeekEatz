import { resolveRestaurantUniversal } from './lib/restaurant-resolver';
async function run() {
    const res = await resolveRestaurantUniversal('olive garden', 'olive garden');
    console.log('olive garden:', res);
}
run();

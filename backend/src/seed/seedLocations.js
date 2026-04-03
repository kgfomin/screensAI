import dotenv from 'dotenv';
import { query } from '../db/client.js';
import { initSchema } from '../db/schema.js';

dotenv.config();

const cities = [
  'Москва',
  'Санкт-Петербург',
  'Казань',
  'Новосибирск',
  'Екатеринбург',
  'Нижний Новгород',
  'Краснодар',
  'Сочи',
  'Самара',
  'Владивосток'
];

const points = [
  'ТЦ',
  'Метро',
  'Аэропорт',
  'Вокзал',
  'Бизнес-центр',
  'Университет',
  'Парк',
  'Гипермаркет',
  'Фудмолл',
  'Технопарк'
];

const locations = [];
let id = 1;
for (const city of cities) {
  for (const point of points) {
    locations.push({
      id,
      city,
      location: `${point} ${city} #${id}`
    });
    id += 1;
  }
}

async function main() {
  await initSchema();
  await query('TRUNCATE TABLE locations RESTART IDENTITY CASCADE');
  for (const location of locations) {
    await query('INSERT INTO locations (city, location) VALUES ($1, $2)', [location.city, location.location]);
  }
  console.log(`Seeded ${locations.length} locations`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

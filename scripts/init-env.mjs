import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const target = new URL('../.env', import.meta.url);
if (existsSync(target)) {
  console.log('.env already exists; preserved existing settings.');
} else {
  const password = randomBytes(24).toString('hex');
  const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  writeFileSync(target, template.replaceAll('pmrms_dev_password', password), { flag: 'wx' });
  console.log('Created .env with a random local database password.');
}

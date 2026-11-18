import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const target = new URL('../.env', import.meta.url);
if (existsSync(target)) {
  console.log('.env already exists; preserved existing settings.');
} else {
  const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  const contents = template
    .replaceAll('pmrms_dev_password', randomBytes(24).toString('hex'))
    .replace('jwt_access_generated_secret', randomBytes(48).toString('base64url'))
    .replace('refresh_pepper_generated_secret', randomBytes(48).toString('base64url'));
  writeFileSync(target, contents, { flag: 'wx' });
  console.log('Created .env with a random database password and authentication secrets.');
}

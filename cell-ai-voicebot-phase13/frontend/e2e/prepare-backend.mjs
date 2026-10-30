// Runs before the e2e backend starts (see playwright.config.ts → webServer):
// wipes the e2e database + Redis db, runs migrations and creates the superadmin.
// Only touches this project's own containers (cav-mongo, cav-redis).
import { execFileSync } from 'node:child_process';

const {
  E2E_DB = 'cav_e2e',
  E2E_REDIS_DB = '5',
  E2E_SUPERADMIN_EMAIL,
  E2E_SUPERADMIN_PASSWORD,
} = process.env;
if (!E2E_SUPERADMIN_EMAIL || !E2E_SUPERADMIN_PASSWORD) {
  throw new Error('E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD are required');
}

const run = (cmd, args, input) =>
  execFileSync(cmd, args, { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'], input });

run('docker', [
  'exec',
  'cav-mongo',
  'mongosh',
  '--port',
  '27018',
  '--quiet',
  '--eval',
  `db.getSiblingDB('${E2E_DB}').dropDatabase()`,
]);
run('docker', ['exec', 'cav-redis', 'redis-cli', '-n', E2E_REDIS_DB, 'FLUSHDB']);
run('npm', ['run', '--silent', 'db:migrate']);
run(
  'npm',
  [
    'run',
    '--silent',
    'superadmin:create',
    '--',
    E2E_SUPERADMIN_EMAIL,
    'E2E Admin',
    '--password-stdin',
  ],
  E2E_SUPERADMIN_PASSWORD,
);

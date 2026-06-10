// OBD BACKUP — PostgreSQL dump with rotation (last 30 files)
import { spawn } from 'child_process';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { readFileSync, writeFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const BACKUP_DIR = join(process.cwd(), 'backups');
const MAX_BACKUPS = 30;

function parseDatabaseUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: u.username,
    password: u.password,
    database: u.pathname.replace(/^\//, '').split('?')[0],
  };
}

async function runPgDump(cfg, outFile) {
  return new Promise((resolve, reject) => {
    const args = [
      '-h', cfg.host,
      '-p', cfg.port,
      '-U', cfg.user,
      '-d', cfg.database,
      '-f', outFile,
      '--no-owner',
      '--no-acl',
    ];
    const env = { ...process.env, PGPASSWORD: cfg.password };
    const proc = spawn('pg_dump', args, { env, shell: process.platform === 'win32' });
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `pg_dump exit ${code}`))));
  });
}

function rotateBackups() {
  if (!readdirSync(BACKUP_DIR).length) return;
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.sql.gz'))
    .map((f) => ({ name: f, mtime: statSync(join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const f of files.slice(MAX_BACKUPS)) {
    unlinkSync(join(BACKUP_DIR, f.name));
    console.log('Removed old backup:', f.name);
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sqlFile = join(BACKUP_DIR, `fleet_obd_${ts}.sql`);
  const gzFile = `${sqlFile}.gz`;

  console.log('OBD BACKUP: starting pg_dump...');
  const cfg = parseDatabaseUrl(dbUrl);

  try {
    await runPgDump(cfg, sqlFile);
    const sql = readFileSync(sqlFile);
    const gz = gzipSync(sql);
    writeFileSync(gzFile, gz);
    unlinkSync(sqlFile);
    const sizeKb = (gz.length / 1024).toFixed(1);
    console.log(`OBD BACKUP: complete → ${gzFile} (${sizeKb} KB)`);
    rotateBackups();
  } catch (err) {
    console.error('OBD BACKUP failed:', err.message);
    console.error('Ensure pg_dump is on PATH (PostgreSQL client tools).');
    process.exit(1);
  }
}

main();

import pkg from 'pg';
const { Pool } = pkg;
import { readFileSync } from 'fs';
import { join } from 'path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

async function runMigration() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    const migrationSQL = readFileSync(join(process.cwd(), 'drizzle', '0003_add_advanced_metrics.sql'), 'utf-8');
    
    console.log('Running migration...');
    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.code === '42701' || error.message?.includes('already exists')) {
      console.log('ℹ️  Columns already exist, migration already applied');
    }
  } finally {
    await pool.end();
  }
}

runMigration();

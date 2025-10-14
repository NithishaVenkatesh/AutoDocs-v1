#!/usr/bin/env node

/**
 * Database Setup Script
 * This script creates the necessary tables for the AutoDocs application
 */

const { Client } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const schema = `
-- Create repositories table
CREATE TABLE IF NOT EXISTS repositories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL UNIQUE,
  github_id BIGINT UNIQUE NOT NULL,
  merkle_root VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on github_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_repositories_github_id ON repositories(github_id);

-- Create repo_documentation table
CREATE TABLE IF NOT EXISTS repo_documentation (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  chunk_hashes TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(repo_id, file_path)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_repo_documentation_repo_id ON repo_documentation(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_documentation_file_path ON repo_documentation(file_path);

-- Create repo_contents table (for storing file contents)
CREATE TABLE IF NOT EXISTS repo_contents (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  sha VARCHAR(40) NOT NULL,
  size INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(repo_id, file_path)
);

-- Create index for repo_contents
CREATE INDEX IF NOT EXISTS idx_repo_contents_repo_id ON repo_contents(repo_id);
`;

async function setupDatabase() {
  console.log('🚀 Starting database setup...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL environment variable is not set');
    console.error('   Please add it to your .env.local file');
    process.exit(1);
  }

  const client = new Client(process.env.DATABASE_URL);

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database\n');

    console.log('📝 Creating tables...');
    await client.query(schema);
    console.log('✅ Tables created successfully\n');

    // Verify tables were created
    console.log('🔍 Verifying tables...');
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('repositories', 'repo_documentation', 'repo_contents')
      ORDER BY table_name;
    `);

    console.log('✅ Found tables:');
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    console.log('\n🎉 Database setup completed successfully!');
    console.log('\nYou can now:');
    console.log('1. Start your dev server: npm run dev -- -p 4000');
    console.log('2. Make a push to your GitHub repository');
    console.log('3. Watch the webhook logs for documentation generation\n');

  } catch (error) {
    console.error('\n❌ Error setting up database:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

setupDatabase();

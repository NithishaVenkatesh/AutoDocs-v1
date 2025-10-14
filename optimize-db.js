#!/usr/bin/env node

/**
 * Database Optimization Script for Documentation Performance
 *
 * This script adds indexes to improve query performance for the repo_documentation table.
 * Run this once to optimize your Neon database.
 */

const { Client } = require('@neondatabase/serverless');

async function optimizeDatabase() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔧 Connecting to database...');
    await client.connect();

    console.log('📊 Creating indexes for better query performance...');

    // Index on repo_name for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_repo_documentation_repo_name
      ON repo_documentation(repo_name);
    `);

    // Index on file_path for faster file-specific queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_repo_documentation_file_path
      ON repo_documentation(file_path);
    `);

    // Composite index for repo + file queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_repo_documentation_repo_file
      ON repo_documentation(repo_name, file_path);
    `);

    console.log('✅ Indexes created successfully!');

    // Show current indexes
    const indexes = await client.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'repo_documentation';
    `);

    console.log('\n📋 Current indexes on repo_documentation table:');
    indexes.rows.forEach((index, i) => {
      console.log(`${i + 1}. ${index.indexname}: ${index.indexdef}`);
    });

  } catch (error) {
    console.error('❌ Error optimizing database:', error);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

optimizeDatabase();

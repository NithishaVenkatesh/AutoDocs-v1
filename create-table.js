// create-table.js
import { Client } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config(); // load .env

const db = new Client({ connectionString: process.env.DATABASE_URL });

async function createTable() {
  try {
    await db.connect();

    await db.query(`
      CREATE TABLE IF NOT EXISTS repos (
        id SERIAL PRIMARY KEY,
        clerk_user_id TEXT NOT NULL,
        github_repo_id BIGINT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        full_name TEXT,
        html_url TEXT,
        github_token TEXT,
        webhook_id BIGINT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add columns if they don't exist (for existing tables)
    await db.query(`
      DO $$
      BEGIN
        BEGIN
          ALTER TABLE repos ADD COLUMN IF NOT EXISTS full_name TEXT;
          ALTER TABLE repos ADD COLUMN IF NOT EXISTS html_url TEXT;
          ALTER TABLE repos ADD COLUMN IF NOT EXISTS webhook_id BIGINT;
          ALTER TABLE repos ADD COLUMN IF NOT EXISTS webhook_error TEXT;
          ALTER TABLE repos ADD COLUMN IF NOT EXISTS docs_status TEXT DEFAULT 'not_started';
          ALTER TABLE repos ADD COLUMN IF NOT EXISTS docs_progress INTEGER DEFAULT 0;
          ALTER TABLE repos ADD COLUMN IF NOT EXISTS docs_message TEXT;
          ALTER TABLE repos ADD COLUMN IF NOT EXISTS docs_updated_at TIMESTAMPTZ;
        EXCEPTION
          WHEN duplicate_column THEN 
            RAISE NOTICE 'Columns already exist';
        END;
      END $$;
    `);

    console.log("✅ Table 'repos' is up to date!");
  } catch (err) {
    console.error("❌ Error creating/updating table:", err);
  } finally {
    await db.end();
  }
}

createTable();

// Script to add repo_name column to repo_documentation table for easier lookup
import { Client } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const db = new Client({ connectionString: process.env.DATABASE_URL });

async function addRepoNameColumn() {
  try {
    await db.connect();
    console.log('Connected to database\n');

    // Add repo_name column to repo_documentation table
    console.log('Adding repo_name column to repo_documentation table...');
    await db.query(`
      ALTER TABLE repo_documentation 
      ADD COLUMN IF NOT EXISTS repo_name TEXT;
    `);
    console.log('✅ Column added\n');

    // Update existing records with repo names
    console.log('Updating existing records with repo names...');
    
    // Get all documentation records
    const docsResult = await db.query(`
      SELECT rd.id, rd.repo_id, r.name as repo_name, r.full_name
      FROM repo_documentation rd
      JOIN repositories r ON rd.repo_id = r.id
    `);

    console.log(`Found ${docsResult.rows.length} documentation records to update\n`);

    for (const doc of docsResult.rows) {
      // Extract repo name from full_name (e.g., "NithishaVenkatesh/Library-Management-System" -> "Library-Management-System")
      const repoName = doc.full_name ? doc.full_name.split('/')[1] : doc.repo_name;
      
      await db.query(
        'UPDATE repo_documentation SET repo_name = $1 WHERE id = $2',
        [repoName, doc.id]
      );
      
      console.log(`✅ Updated doc ${doc.id} with repo_name: ${repoName}`);
    }

    // Create index for faster lookups
    console.log('\nCreating index on repo_name...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_repo_documentation_repo_name 
      ON repo_documentation(repo_name);
    `);
    console.log('✅ Index created\n');

    console.log('🎉 Migration completed successfully!');
    
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await db.end();
  }
}

addRepoNameColumn();

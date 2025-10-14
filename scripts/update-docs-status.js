// Script to update documentation status for existing repos
import { Client } from "@neondatabase/serverless";
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const db = new Client({ connectionString: process.env.DATABASE_URL });

async function updateDocsStatus() {
  try {
    await db.connect();
    console.log('Connected to database');

    // Get all repos
    const result = await db.query('SELECT id, name FROM repos');
    console.log(`Found ${result.rows.length} repositories`);

    const outputDir = path.join(__dirname, '..', 'output');

    for (const repo of result.rows) {
      const repoOutputPath = path.join(outputDir, repo.name);
      
      try {
        // Check if documentation exists
        await fs.access(repoOutputPath);
        const files = await fs.readdir(repoOutputPath);
        const mdFiles = files.filter(f => f.endsWith('.md'));

        if (mdFiles.length > 0) {
          // Documentation exists
          await db.query(
            `UPDATE repos 
             SET docs_status = $1, 
                 docs_progress = $2, 
                 docs_message = $3,
                 docs_updated_at = NOW()
             WHERE id = $4`,
            ['complete', 100, 'Documentation is ready!', repo.id]
          );
          console.log(`✅ Updated ${repo.name}: complete (${mdFiles.length} files)`);
        } else {
          // No docs yet
          await db.query(
            `UPDATE repos 
             SET docs_status = $1, 
                 docs_progress = $2, 
                 docs_message = $3
             WHERE id = $4`,
            ['not_started', 0, 'Documentation not generated yet', repo.id]
          );
          console.log(`⚠️  Updated ${repo.name}: not_started`);
        }
      } catch (error) {
        // Directory doesn't exist
        await db.query(
          `UPDATE repos 
           SET docs_status = $1, 
               docs_progress = $2, 
               docs_message = $3
           WHERE id = $4`,
          ['not_started', 0, 'Documentation not generated yet', repo.id]
        );
        console.log(`⚠️  Updated ${repo.name}: not_started (no output dir)`);
      }
    }

    console.log('\n✅ All repositories updated!');
  } catch (err) {
    console.error("❌ Error updating docs status:", err);
  } finally {
    await db.end();
  }
}

updateDocsStatus();

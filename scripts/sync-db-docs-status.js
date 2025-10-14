// Script to sync documentation status based on repo_documentation table
import { Client } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const db = new Client({ connectionString: process.env.DATABASE_URL });

async function syncDocsStatus() {
  try {
    await db.connect();
    console.log('Connected to database\n');

    // Get all repos
    const reposResult = await db.query('SELECT id, name, github_repo_id FROM repos');
    console.log(`Found ${reposResult.rows.length} repositories in repos table\n`);

    for (const repo of reposResult.rows) {
      try {
        // Check if there's a corresponding entry in repositories table
        const repositoryResult = await db.query(
          'SELECT id FROM repositories WHERE github_id = $1',
          [repo.github_repo_id]
        );

        if (repositoryResult.rows.length > 0) {
          const repositoryId = repositoryResult.rows[0].id;
          
          // Check if documentation exists
          const docsResult = await db.query(
            'SELECT COUNT(*) as count, MAX(updated_at) as last_updated FROM repo_documentation WHERE repo_id = $1',
            [repositoryId]
          );

          const docCount = parseInt(docsResult.rows[0].count);
          const lastUpdated = docsResult.rows[0].last_updated;

          if (docCount > 0) {
            // Documentation exists - update status to complete
            await db.query(
              `UPDATE repos 
               SET docs_status = $1, 
                   docs_progress = $2, 
                   docs_message = $3,
                   docs_updated_at = $4
               WHERE id = $5`,
              ['complete', 100, 'Documentation is ready!', lastUpdated, repo.id]
            );
            console.log(`✅ ${repo.name}: complete (${docCount} documentation files)`);
          } else {
            // No documentation yet
            await db.query(
              `UPDATE repos 
               SET docs_status = $1, 
                   docs_progress = $2, 
                   docs_message = $3
               WHERE id = $4`,
              ['not_started', 0, 'Documentation not generated yet', repo.id]
            );
            console.log(`⚠️  ${repo.name}: not_started (no docs in database)`);
          }
        } else {
          // No entry in repositories table
          await db.query(
            `UPDATE repos 
             SET docs_status = $1, 
                 docs_progress = $2, 
                 docs_message = $3
             WHERE id = $4`,
            ['not_started', 0, 'Documentation not generated yet', repo.id]
          );
          console.log(`⚠️  ${repo.name}: not_started (no repository entry)`);
        }
      } catch (error) {
        console.error(`❌ Error processing ${repo.name}:`, error.message);
      }
    }

    console.log('\n✅ Documentation status sync completed!');
  } catch (err) {
    console.error("❌ Error syncing docs status:", err);
  } finally {
    await db.end();
  }
}

syncDocsStatus();

// Test script to check if we can fetch documentation
import { Client } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const db = new Client({ connectionString: process.env.DATABASE_URL });

async function testDocsFetch() {
  try {
    await db.connect();
    console.log('Connected to database\n');

    // Test with Library-Management-System
    const repoName = 'Library-Management-System';
    console.log(`Testing documentation fetch for: ${repoName}\n`);

    // Get repo info
    const repoResult = await db.query(
      'SELECT id, name, github_repo_id FROM repos WHERE name = $1',
      [repoName]
    );

    if (repoResult.rows.length === 0) {
      console.log('❌ Repo not found in repos table');
      return;
    }

    console.log('✅ Found repo:', repoResult.rows[0]);
    const githubRepoId = repoResult.rows[0].github_repo_id;

    // Get repository entry
    const repositoryResult = await db.query(
      'SELECT id, name, full_name FROM repositories WHERE github_id = $1',
      [githubRepoId]
    );

    if (repositoryResult.rows.length === 0) {
      console.log('❌ No entry in repositories table');
      return;
    }

    console.log('✅ Found repository:', repositoryResult.rows[0]);
    const repositoryId = repositoryResult.rows[0].id;

    // Get documentation
    const docsResult = await db.query(
      'SELECT id, file_path, LENGTH(content) as content_length, updated_at FROM repo_documentation WHERE repo_id = $1',
      [repositoryId]
    );

    console.log(`\n✅ Found ${docsResult.rows.length} documentation files:`);
    docsResult.rows.forEach(doc => {
      console.log(`   - ${doc.file_path} (${doc.content_length} chars, updated: ${doc.updated_at})`);
    });

    // Fetch one file content
    if (docsResult.rows.length > 0) {
      const firstFile = docsResult.rows[0];
      const contentResult = await db.query(
        'SELECT content FROM repo_documentation WHERE id = $1',
        [firstFile.id]
      );
      console.log(`\n📄 Sample content from ${firstFile.file_path}:`);
      console.log(contentResult.rows[0].content.substring(0, 200) + '...\n');
    }

  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await db.end();
  }
}

testDocsFetch();

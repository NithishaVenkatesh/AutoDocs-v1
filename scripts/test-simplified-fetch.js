// Test the simplified documentation fetch
import { Client } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const db = new Client({ connectionString: process.env.DATABASE_URL });

async function testSimplifiedFetch() {
  try {
    await db.connect();
    console.log('✅ Connected to database\n');

    const repoName = 'Library-Management-System';
    console.log(`Testing simplified fetch for: ${repoName}\n`);

    // Direct query using repo_name - much simpler!
    const docsResult = await db.query(
      'SELECT file_path, LENGTH(content) as content_length FROM repo_documentation WHERE repo_name = $1',
      [repoName]
    );

    console.log(`✅ Found ${docsResult.rows.length} documentation files:`);
    docsResult.rows.forEach(doc => {
      console.log(`   - ${doc.file_path} (${doc.content_length} chars)`);
    });

    if (docsResult.rows.length > 0) {
      // Get the content of the first file
      const contentResult = await db.query(
        'SELECT content FROM repo_documentation WHERE repo_name = $1 LIMIT 1',
        [repoName]
      );
      
      console.log(`\n📄 Sample content preview:`);
      console.log(contentResult.rows[0].content.substring(0, 300) + '...\n');
      console.log('✅ Documentation fetch successful!');
    }

  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await db.end();
  }
}

testSimplifiedFetch();

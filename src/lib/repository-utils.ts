import { Client } from '@neondatabase/serverless';

// Helper function to mark repository as complete when documents exist
export async function ensureRepositoryStatus(repoName: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    // Check if repository exists and has documents
    const result = await client.query(
      `SELECT r.id, r.name, r.docs_status, COUNT(rd.id) as doc_count
       FROM repositories r
       LEFT JOIN repo_documentation rd ON r.id = rd.repo_id
       WHERE r.name = $1
       GROUP BY r.id, r.name, r.docs_status`,
      [repoName]
    );

    if (result.rows.length > 0) {
      const repo = result.rows[0];
      const hasDocuments = parseInt(repo.doc_count) > 0;

      // If there are documents but status is not complete, update to complete
      if (hasDocuments && repo.docs_status !== 'complete') {
        console.log(`[STATUS] Auto-correcting status for ${repoName}: has ${repo.doc_count} documents but status is ${repo.docs_status}`);

        await client.query(
          `UPDATE repositories
           SET docs_status = 'complete',
               docs_progress = 100,
               docs_message = 'Documentation completed',
               updated_at = NOW()
           WHERE name = $1`,
          [repoName]
        );

        return true; // Status was updated
      }
    }

    return false; // No update needed
  } catch (error) {
    console.error('Error ensuring repository status:', error);
    return false;
  } finally {
    await client.end().catch(console.error);
  }
}

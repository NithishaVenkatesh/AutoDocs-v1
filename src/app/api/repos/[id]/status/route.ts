import { NextResponse } from 'next/server';
import { Client } from '@neondatabase/serverless';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    const { id } = await params;
    
    // First check if the repository exists
    const repoResult = await client.query(
      'SELECT id, name FROM repositories WHERE name = $1',
      [id]
    );

    if (repoResult.rows.length === 0) {
      return NextResponse.json(
        { 
          status: 'not_found',
          message: 'Repository not found',
          progress: 0,
          lastUpdated: new Date().toISOString()
        },
        { 
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const repoId = repoResult.rows[0].id;

    // Check if there are any documents in repo_documentation for this repository
    const docsResult = await client.query(
      'SELECT COUNT(*) as doc_count FROM repo_documentation WHERE repo_id = $1',
      [repoId]
    );

    const hasDocuments = parseInt(docsResult.rows[0].doc_count) > 0;

    // Get the current documentation status from repositories table
    const statusResult = await client.query(
      `SELECT 
        COALESCE(docs_status, 'not_started') as status,
        COALESCE(docs_progress, 0) as progress,
        COALESCE(docs_message, '') as message,
        COALESCE(updated_at, NOW()) as last_updated
      FROM repositories 
      WHERE name = $1`,
      [id]
    );

    let status = statusResult.rows[0] || {
      status: 'not_started',
      progress: 0,
      message: 'Documentation generation not started',
      last_updated: new Date().toISOString()
    };

    // If there are documents but status is not complete, update to complete
    if (hasDocuments && status.status !== 'complete') {
      console.log(`[STATUS] Repository ${id} has ${docsResult.rows[0].doc_count} documents but status is ${status.status}. Updating to complete.`);

      // Update the status to complete since documents exist
      await client.query(
        `UPDATE repositories 
         SET docs_status = 'complete',
             docs_progress = 100,
             docs_message = 'Documentation completed',
             updated_at = NOW()
         WHERE name = $1`,
        [id]
      );

      status = {
        status: 'complete',
        progress: 100,
        message: 'Documentation completed',
        last_updated: new Date().toISOString()
      };
    }

    return NextResponse.json({
      status: status.status,
      progress: status.progress,
      message: status.message,
      lastUpdated: status.last_updated,
      hasDocuments: hasDocuments // Include this for debugging
    });
  } catch (error) {
    console.error('Error fetching status:', error);
    return NextResponse.json(
      { 
        status: 'error',
        message: 'Error fetching status',
        progress: 0,
        lastUpdated: new Date().toISOString()
      },
      { status: 200 }
    );
  } finally {
    await client.end().catch(console.error);
  }
}

// Helper function to update generation status
export async function updateGenerationStatus(repoName: string, status: string, progress: number, message: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    await client.query(
      `UPDATE repositories
       SET docs_status = $1,
           docs_progress = $2,
           docs_message = $3,
           updated_at = NOW()
       WHERE name = $4`,
      [status, progress, message, repoName]
    );

    console.log(`[STATUS] Updated status for ${repoName}: ${status} (${progress}%)`);
  } catch (error) {
    console.error('Error updating generation status:', error);
  } finally {
    await client.end().catch(console.error);
  }
}

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

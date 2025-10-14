import { Client } from '@neondatabase/serverless';

export async function updateRepoDocsStatus(
  repoName: string,
  status: 'not_started' | 'generating' | 'complete' | 'error',
  progress: number,
  message: string
) {
  // Check if DATABASE_URL is available
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set in updateRepoDocsStatus');
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    await client.query(
      `UPDATE repositories
       SET docs_status = $1,
           docs_progress = $2,
           docs_message = $3,
           docs_updated_at = NOW()
       WHERE name = $4`,
      [status, progress, message, repoName]
    );

    console.log(`Updated docs status for ${repoName}: ${status} (${progress}%)`);
  } catch (error) {
    console.error('Error updating repo docs status:', error);
    // Don't throw, just log the error for update operations
  } finally {
    try {
      await client.end();
    } catch (e) {
      // Ignore connection close errors
    }
  }
}

export async function getRepoDocsStatus(repoName: string) {
  // Check if DATABASE_URL is available
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set in getRepoDocsStatus');
    return {
      status: 'not_started',
      progress: 0,
      message: 'Database not configured'
    };
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    const result = await client.query(
      `SELECT 
        'not_started' as docs_status, 
        0 as docs_progress, 
        'Documentation generation not started' as docs_message,
        NOW() as docs_updated_at
       FROM repositories
       WHERE name = $1`,
      [repoName]
    );

    if (result.rows.length === 0) {
      // If no record exists, return default status
      return {
        status: 'not_started' as const,
        progress: 0,
        message: 'Repository not found'
      };
    }

    const row = result.rows[0];
    return {
      status: row.docs_status || 'not_started',
      progress: row.docs_progress || 0,
      message: row.docs_message || 'Documentation generation not started',
      lastUpdated: row.docs_updated_at || new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting repo docs status:', error);
    return {
      status: 'error',
      progress: 0,
      message: 'Failed to fetch status'
    };
  } finally {
    try {
      await client.end();
    } catch (e) {
      // Ignore connection close errors
    }
  }
}

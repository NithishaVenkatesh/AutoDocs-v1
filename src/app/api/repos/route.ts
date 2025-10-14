import { NextResponse } from 'next/server';
import { Client } from '@neondatabase/serverless';
import { auth } from '@clerk/nextjs/server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = new Client(process.env.DATABASE_URL);
  
  try {
    await db.connect();
    
    // Fetch repositories for the current user
    const result = await db.query(
      `SELECT id, name, github_repo_id as "githubRepoId", 
              html_url as "htmlUrl", created_at as "createdAt" 
       FROM repos 
       WHERE clerk_user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    
    return NextResponse.json({ repos: result.rows });
  } catch (error) {
    console.error('Error fetching repositories:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch repositories' },
      { status: 500 }
    );
  } finally {
    await db.end();
  }
}

export const dynamic = 'force-dynamic'; // Ensure fresh data on every request

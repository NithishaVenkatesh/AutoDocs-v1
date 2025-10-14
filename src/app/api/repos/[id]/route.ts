import { NextResponse } from 'next/server';
import { Client } from '@neondatabase/serverless';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    
    const { searchParams } = new URL(request.url);
    const requestedFile = searchParams.get('file');
    const { id } = await params;
    const repoName = id;
    
    console.log(`[DOCS API] Fetching documentation for repo: ${repoName}, file: ${requestedFile || 'all'}`);
    
    // Special case: Check if repository has any documents
    if (requestedFile === 'check') {
      const docCountResult = await client.query(
        'SELECT COUNT(*) as doc_count FROM repo_documentation WHERE repo_name = $1',
        [repoName]
      );

      const hasDocuments = parseInt(docCountResult.rows[0].doc_count) > 0;

      return NextResponse.json({
        hasDocuments: hasDocuments,
        documentCount: parseInt(docCountResult.rows[0].doc_count)
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }
    
    // If a specific file is requested, return its content
    if (requestedFile) {
      const docResult = await client.query(
        'SELECT content, file_path FROM repo_documentation WHERE repo_name = $1 AND file_path = $2',
        [repoName, requestedFile]
      );
      
      if (docResult.rows.length === 0) {
        console.log(`[DOCS API] File not found: ${requestedFile} for repo: ${repoName}`);
        return NextResponse.json(
          { status: 'error', message: 'File not found' },
          { 
            status: 404,
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            },
          }
        );
      }
      
      console.log(`[DOCS API] Returning file: ${requestedFile}`);
      return NextResponse.json({
        status: 'complete',
        content: docResult.rows[0].content,
        currentFile: requestedFile
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'Content-Type': 'application/json',
        },
      });
    }

    // Get all documentation files for this repo - optimize query for better performance
    // First get just the file paths to determine main file, then fetch content for main file only
    const filesResult = await client.query(
      'SELECT file_path FROM repo_documentation WHERE repo_name = $1 ORDER BY file_path',
      [repoName]
    );

    if (filesResult.rows.length === 0) {
      console.log(`[DOCS API] No documentation found for repo: ${repoName}`);
      return NextResponse.json(
        { status: 'error', message: 'No documentation found' },
        {
          status: 404,
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Find the main file (index.md or README.md) or use the first one
    const mainFile = filesResult.rows.find(doc =>
      doc.file_path.toLowerCase() === 'index.md' ||
      doc.file_path.toLowerCase() === 'readme.md'
    ) || filesResult.rows[0];

    // Fetch only the main file content for initial load (faster)
    const mainFileResult = await client.query(
      'SELECT content FROM repo_documentation WHERE repo_name = $1 AND file_path = $2',
      [repoName, mainFile.file_path]
    );

    if (mainFileResult.rows.length === 0) {
      console.log(`[DOCS API] Main file not found: ${mainFile.file_path}`);
      return NextResponse.json(
        { status: 'error', message: 'Main file not found' },
        {
          status: 404,
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log(`[DOCS API] Returning main file: ${mainFile.file_path} (optimized load)`);
    
    return NextResponse.json({
      status: 'complete',
      content: mainFileResult.rows[0].content,
      files: filesResult.rows.map(doc => ({
        name: doc.file_path,
        path: doc.file_path
      })),
      currentFile: mainFile.file_path
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'Content-Type': 'application/json',
      },
    });
    
  } catch (error) {
    console.error('Error fetching documentation from database:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Internal server error', 
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } finally {
    await client.end();
  }
}

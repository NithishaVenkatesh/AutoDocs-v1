import { NextResponse } from 'next/server';
import { checkDocumentationStatus, getGenerationStatus } from '@/lib/documentation';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  try {
    const { repoId } = await params;
    
    if (!repoId) {
      return NextResponse.json(
        { error: 'Repository ID is required' },
        { status: 400 }
      );
    }
    
    // Get the basic status
    const status = await checkDocumentationStatus(repoId);
    
    // Add Merkle tree data if available
    let merkleData = null;
    const merklePath = path.join(process.cwd(), 'output', repoId, '.merkle.json');
    try {
      const merkleContent = await fs.readFile(merklePath, 'utf-8');
      merkleData = JSON.parse(merkleContent);
    } catch (error) {
      console.log(`No Merkle data found for ${repoId} at ${merklePath}`);
    }
    
    // Check PocketFlow output directory
    const pocketflowOutput = path.join(process.cwd(), 'PocketFlow-Tutorial-Codebase-Knowledge', 'output', repoId);
    let pocketflowOutputExists = false;
    let pocketflowFiles: string[] = [];
    
    try {
      await fs.access(pocketflowOutput);
      pocketflowOutputExists = true;
      pocketflowFiles = await fs.readdir(pocketflowOutput);
    } catch (error) {
      console.log(`PocketFlow output not found at ${pocketflowOutput}`);
    }

    // Get generation status from memory
    const generationStatus = getGenerationStatus(repoId);
    
    // Enhanced response with debug information
    return NextResponse.json({
      ...status,
      generationStatus,
      debug: {
        merkleFileExists: !!merkleData,
        pocketflowOutput: {
          exists: pocketflowOutputExists,
          path: pocketflowOutput,
          files: pocketflowFiles
        },
        lastUpdated: new Date().toISOString(),
        statusCheckCount: (status as any).statusCheckCount ? (status as any).statusCheckCount + 1 : 1
      }
    });
    
  } catch (error) {
    console.error('Error checking documentation status:', error);
    return NextResponse.json(
      { 
        status: 'error',
        message: 'Failed to check documentation status',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
      },
      { status: 500 }
    );
  }
}

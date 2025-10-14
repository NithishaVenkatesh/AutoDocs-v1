import { promises as fs } from 'fs';
import path from 'path';
import { MerkleTree } from './merkle-utils';
import { updateRepoDocsStatus, getRepoDocsStatus } from './db';

// Default exclude patterns for documentation generation
const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/*.md',
  '**/*.mdx',
  '**/LICENSE',
  '**/README*',
  '**/.env*',
  '**/*.log',
  '**/*.lock'
];

// Track generation status in memory
const generationStatus = new Map<string, {
  status: 'generating' | 'complete' | 'error';
  progress: number;
  message: string;
  merkleRoot?: string;
  fileHashes?: Array<{ path: string; hash: string }>;
}>();

export async function checkDocumentationStatus(repoId: string) {
  try {
    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL not set, returning default status');
      return {
        status: 'not_started' as const,
        progress: 0,
        message: 'Database not configured'
      };
    }

    // First, check the database for the status
    const dbStatus = await getRepoDocsStatus(repoId);

    // Also check if documentation exists in the repo_documentation table using repo_name directly
    const { Client } = await import('@neondatabase/serverless');
    const client = new Client({ connectionString: process.env.DATABASE_URL });

    try {
      await client.connect();

      // Check if documentation exists using repo_name directly - much simpler!
      const docsResult = await client.query(
        'SELECT COUNT(*) as count FROM repo_documentation WHERE repo_name = $1',
        [repoId]
      );

      const docCount = parseInt(docsResult.rows[0].count);

      if (docCount > 0) {
        // Documentation exists in database
        // If DB says not complete, update it
        if (dbStatus.status !== 'complete') {
          await updateRepoDocsStatus(repoId, 'complete', 100, 'Documentation is ready!');
          return {
            status: 'complete' as const,
            progress: 100,
            message: 'Documentation is ready!'
          };
        }

        // Return DB status
        return {
          status: dbStatus.status as 'complete' | 'generating' | 'error' | 'not_started',
          progress: dbStatus.progress,
          message: dbStatus.message
        };
      }
    } catch (error) {
      console.error('Error checking repo_documentation table:', error);
      // Don't throw, just log and continue
    } finally {
      try {
        await client.end();
      } catch (e) {
        // Ignore connection close errors
      }
    }

    // Return database status
    return {
      status: dbStatus.status as 'complete' | 'generating' | 'error' | 'not_started',
      progress: dbStatus.progress,
      message: dbStatus.message
    };
  } catch (error) {
    console.error('Error checking documentation status:', error);
    return {
      status: 'error' as const,
      progress: 0,
      message: error instanceof Error ? error.message : 'Failed to check documentation status'
    };
  }
}

export async function generateDocumentationWithMerkle(
  repoPath: string,
  outputPath: string,
  excludePatterns: string[] = DEFAULT_EXCLUDE_PATTERNS
): Promise<{ 
  success: boolean;
  merkleRoot: string;
  fileHashes: Array<{ path: string; hash: string }>;
}> {
  try {
    // Build Merkle tree of source files
    const merkleTree = await MerkleTree.fromDirectory(repoPath, excludePatterns);
    const merkleRoot = merkleTree.getRootHash();
    const fileHashes = merkleTree.getFileHashes();

    // Ensure output directory exists
    await fs.mkdir(outputPath, { recursive: true });

    // Store Merkle tree data
    await fs.writeFile(
      path.join(outputPath, '.merkle.json'),
      JSON.stringify({ merkleRoot, fileHashes }, null, 2)
    );

    return { 
      success: true, 
      merkleRoot, 
      fileHashes 
    };
  } catch (error) {
    console.error('Documentation generation error:', error);
    throw error;
  }
}

export async function verifyDocumentation(
  docsPath: string,
  filePath: string
): Promise<boolean> {
  try {
    // Load Merkle data
    const merkleData = await fs.readFile(
      path.join(docsPath, '.merkle.json'), 
      'utf-8'
    );
    const { merkleRoot, fileHashes } = JSON.parse(merkleData);
    
    // Find the file in the Merkle tree
    const relativePath = path.relative(docsPath, filePath).replace(/\\/g, '/');
    const fileHash = fileHashes.find((f: any) => f.path === relativePath);
    
    if (!fileHash) {
      console.warn(`File ${relativePath} not found in documentation`);
      return false;
    }
    
    // Verify the file content
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Create a new MerkleTree instance to use its hash method
    const tempTree = new MerkleTree();
    const currentHash = tempTree.hash(content);
    return currentHash === fileHash.hash;
  } catch (error) {
    console.error('Documentation verification error:', error);
    return false;
  }
}

export async function getChangedFiles(
  repoPath: string,
  excludePatterns: string[] = DEFAULT_EXCLUDE_PATTERNS
): Promise<{ path: string; status: 'added' | 'modified' | 'deleted' }[]> {
  try {
    const merkleTree = await MerkleTree.fromDirectory(repoPath, excludePatterns);
    const currentFiles = merkleTree.getFileHashes();
    
    // Check for previous Merkle data
    try {
      const merkleData = await fs.readFile(
        path.join(repoPath, '.merkle.json'),
        'utf-8'
      );
      const { fileHashes: previousFiles } = JSON.parse(merkleData);
      
      const previousFileMap = new Map(previousFiles.map((f: any) => [f.path, f.hash]));
      const changedFiles = [];
      
      // Check for modified and deleted files
      for (const file of previousFiles) {
        const currentFile = currentFiles.find(f => f.path === file.path);
        if (!currentFile) {
          changedFiles.push({ path: file.path, status: 'deleted' as const });
        } else if (currentFile.hash !== file.hash) {
          changedFiles.push({ path: file.path, status: 'modified' as const });
        }
      }
      
      // Check for added files
      for (const file of currentFiles) {
        if (!previousFileMap.has(file.path)) {
          changedFiles.push({ path: file.path, status: 'added' as const });
        }
      }
      
      return changedFiles;
    } catch (error) {
      // No previous Merkle data, all files are new
      return currentFiles.map(file => ({
        path: file.path,
        status: 'added' as const
      }));
    }
  } catch (error) {
    console.error('Error getting changed files:', error);
    throw error;
  }
}

// Helper function to check if a file should be excluded
function shouldExclude(filePath: string, excludePatterns: string[]): boolean {
  return excludePatterns.some(pattern => {
    const regex = new RegExp(
      pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
    );
    return regex.test(filePath);
  });
}

export async function setGenerationStatus(
  repoId: string, 
  status: 'generating' | 'complete' | 'error', 
  progress: number, 
  message: string,
  merkleRoot?: string,
  fileHashes?: Array<{ path: string; hash: string }>
) {
  const statusObj = { 
    status, 
    progress, 
    message,
    merkleRoot,
    fileHashes
  };
  
  // Update in-memory cache
  generationStatus.set(repoId, statusObj);
  
  // Update database
  try {
    await updateRepoDocsStatus(repoId, status, progress, message);
  } catch (error) {
    console.error('Failed to update database status:', error);
  }
  
  return statusObj;
}

export function getGenerationStatus(repoId: string) {
  return generationStatus.get(repoId) || {
    status: 'not_started' as const,
    progress: 0,
    message: 'Documentation generation has not started'
  };
}

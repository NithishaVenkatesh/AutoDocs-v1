import { NextResponse } from 'next/server';
import { getChangedFiles, setGenerationStatus, getGenerationStatus } from '@/lib/documentation';
import { generateDocumentation } from '@/lib/pocketflow';
import path from 'path';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { sendSSEUpdate } from '@/lib/sse';
import { Client } from '@neondatabase/serverless';

const execAsync = promisify(exec);

// Test SSE import
console.log('[Webhook] SSE import test:', typeof sendSSEUpdate);

// Validate GitHub webhook secret
function verifyWebhookSignature(signature: string | null, payload: string, secret: string): boolean {
  if (!signature) return false;
  
  const hmac = require('crypto').createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return signature === digest;
}

export async function POST(request: Request) {
  console.log('[Webhook] Webhook handler called');

  try {
    // Get the raw body for signature verification
    const payload = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    console.log(`[Webhook] Payload length: ${payload.length}, Signature: ${signature ? 'present' : 'missing'}`);

    // Verify webhook secret (replace with your actual secret from environment variables)
    const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
    if (!verifyWebhookSignature(signature, payload, WEBHOOK_SECRET)) {
      console.log('[Webhook] Invalid signature');
      return new NextResponse('Invalid signature', { status: 401 });
    }

    const event = request.headers.get('x-github-event');
    const body = JSON.parse(payload);

    console.log(`[Webhook] Event type: ${event}`);

    // Only process push events
    if (event === 'push') {
      const { repository, ref } = body;
      const repoName = repository.name; // This is just the repo name, not full name
      const repoFullName = repository.full_name; // This is owner/repo format
      const branch = ref.split('/').pop();

      console.log(`[Webhook] Processing push event for repository: ${repoName}`);
      console.log(`[Webhook] Repository object:`, JSON.stringify(repository, null, 2));
      console.log(`[Webhook] Full name from repository: ${repoFullName}`);

      // Only process the main branch
      if (branch === 'main' || branch === 'master') {
        const repoPath = path.join(process.cwd(), 'repos', repoName);
        const outputPath = path.join(process.cwd(), 'output', repoName);
        
        try {
          // Ensure repos directory exists
          await fs.mkdir(path.join(process.cwd(), 'repos'), { recursive: true });
          
          // Clone or update the repository
          try {
            await fs.access(repoPath);
            // Repository exists, pull latest changes
            await execAsync('git pull', { cwd: repoPath });
            console.log(`Pulled latest changes for ${repoName}`);
          } catch (error) {
            // Repository doesn't exist, clone it
            console.log(`Cloning repository: ${repository.clone_url}`);
            await execAsync(`git clone ${repository.clone_url} ${repoPath}`);
            console.log(`Repository cloned to ${repoPath}`);
          }
          // Update generation status
          await setGenerationStatus(
            repoName,
            'generating',
            0,
            'Processing repository changes...'
          );
          
          // Get the list of changed files from the push event
          const pushFiles = body.commits.flatMap((commit: any) => [
            ...(commit.added || []).map((file: string) => ({ path: file, status: 'added' })),
            ...(commit.modified || []).map((file: string) => ({ path: file, status: 'modified' })),
            ...(commit.removed || []).map((file: string) => ({ path: file, status: 'removed' }))
          ]);
          
          console.log(`Processing push with ${pushFiles.length} changed files`);
          
          // Update status with the list of changed files
          await setGenerationStatus(
            repoName,
            'generating',
            10,
            `Processing ${pushFiles.length} changed files...`,
            undefined,
            pushFiles
          );
          
          // Get current status to preserve Merkle data
          const currentStatus = getGenerationStatus(repoName);
          
          // Check if we need to regenerate documentation
          const shouldRegenerate = pushFiles.some((file: { path: string; status: string }) => 
            !file.path.includes('node_modules/') && 
            !file.path.startsWith('.') &&
            !file.path.endsWith('.md')
          );
          
          if (!shouldRegenerate) {
            console.log('No documentation regeneration needed, only markdown files changed');
            
            // Only update status if we have Merkle data
            if ('merkleRoot' in currentStatus && currentStatus.merkleRoot) {
              await setGenerationStatus(
                repoName,
                'complete',
                100,
                'No documentation changes detected',
                currentStatus.merkleRoot,
                currentStatus.fileHashes
              );
            } else {
              await setGenerationStatus(
                repoName,
                'complete',
                100,
                'No documentation changes detected'
              );
            }
            
            return NextResponse.json({ success: true, message: 'No documentation changes needed' });
          }
          
          // Generate documentation in the background without blocking the response
          generateDocumentation(repository.html_url || repository.clone_url)
            .then(async result => {
              if (result.success) {
                // Update status with Merkle tree data
                await setGenerationStatus(
                  repoName,
                  'complete',
                  100,
                  'Documentation regenerated successfully',
                  result.merkleRoot,
                  result.fileHashes
                );

                // Fetch all documentation for this repo from Neon database
                let documentationData = null;
                try {
                  const client = new Client({ connectionString: process.env.DATABASE_URL });
                  await client.connect();

                  const docsResult = await client.query(
                    'SELECT file_path, content FROM repo_documentation WHERE repo_name = $1 ORDER BY file_path',
                    [repoName]
                  );

                  if (docsResult.rows.length > 0) {
                    // Find the main file (index.md or README.md) or use the first one
                    const mainFile = docsResult.rows.find(doc =>
                      doc.file_path.toLowerCase() === 'index.md' ||
                      doc.file_path.toLowerCase() === 'readme.md'
                    ) || docsResult.rows[0];

                    documentationData = {
                      status: 'complete',
                      content: mainFile.content,
                      files: docsResult.rows.map(doc => ({
                        name: doc.file_path,
                        path: doc.file_path
                      })),
                      currentFile: mainFile.file_path
                    };
                  }

                  await client.end();
                } catch (error) {
                  console.error('Error fetching documentation from database:', error);
                }

                // Send SSE update to notify frontend with documentation data
                console.log(`[Webhook] Sending SSE update for completed documentation: ${repoName}`);
                console.log(`[Webhook] SSE data:`, {
                  type: 'documentation_complete',
                  repoName: repoName,
                  status: 'complete',
                  message: 'Documentation regenerated successfully',
                  progress: 100,
                  documentation: documentationData // Include the fetched documentation data
                });
                sendSSEUpdate({
                  type: 'documentation_complete',
                  repoName: repoName,
                  status: 'complete',
                  message: 'Documentation regenerated successfully',
                  progress: 100,
                  documentation: documentationData
                });

                // Log the location of the generated documentation
                const outputPath = path.join(process.cwd(), 'output', repoName);
                console.log(`Documentation generated at: ${outputPath}`);
              } else {
                console.error('Documentation generation failed:', result.error);
                await setGenerationStatus(
                  repoName,
                  'error',
                  0,
                  `Failed to generate documentation: ${result.error || 'Unknown error'}`
                );

                // Send SSE update for error
                console.log(`[Webhook] Sending SSE update for failed documentation: ${repoName}`);
                sendSSEUpdate({
                  type: 'documentation_error',
                  repoName: repoName,
                  status: 'error',
                  message: `Failed to generate documentation: ${result.error || 'Unknown error'}`
                });
              }
            })
            .catch(async error => {
              console.error('Error generating documentation:', error);
              await setGenerationStatus(
                repoName,
                'error',
                0,
                `Failed to generate documentation: ${error instanceof Error ? error.message : 'Unknown error'}`
              );

              // Send SSE update for error
              console.log(`[Webhook] Sending SSE update for error documentation: ${repoName}`);
              sendSSEUpdate({
                type: 'documentation_error',
                repoName: repoName,
                status: 'error',
                message: `Failed to generate documentation: ${error instanceof Error ? error.message : 'Unknown error'}`
              });
            });
          
          // Return immediately without waiting for documentation generation
          return NextResponse.json({ 
            success: true,
            message: 'Webhook received and documentation generation started in background'
          });
          
        } catch (error) {
          console.error('Error processing webhook:', error);
          await setGenerationStatus(
            repoName,
            'error',
            0,
            `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          return NextResponse.json(
            { error: 'Failed to process webhook' },
            { status: 500 }
          );
        }
      }
    }
    
    return NextResponse.json({ message: 'Event processed' });
    
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


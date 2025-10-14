import { NextResponse } from 'next/server';
import { Client } from '@neondatabase/serverless';
import { createHmac } from 'crypto';

// Verify the GitHub webhook signature
function verifySignature(signature: string, payload: string, secret: string): boolean {
  const hmac = createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return signature === digest;
}

// Interface for file changes
interface FileChange {
  path: string;
  action: 'added' | 'modified' | 'removed';
  sha?: string;
  content?: string;
}

// Interface for documentation update result
interface UpdateDocumentationResult {
  success: boolean;
  updatedFiles: number;
  totalChanges: number;
  message?: string;
}

// Enhanced logging configuration
const log = {
  info: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`[${timestamp}] ℹ️ ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`[${timestamp}] ℹ️ ${message}`);
    }
  },
  error: (message: string, error?: any) => {
    const timestamp = new Date().toISOString();
    if (error) {
      const errorInfo = error instanceof Error 
        ? `${error.message}\n${error.stack}` 
        : JSON.stringify(error, null, 2);
      console.error(`[${timestamp}] ❌ ${message}\n${errorInfo}`);
    } else {
      console.error(`[${timestamp}] ❌ ${message}`);
    }
  },
  success: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ✅ ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      console.debug(`[${timestamp}] 🔍 ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }
};

export async function POST(request: Request) {
  const requestId = Math.random().toString(36).substring(2, 8);
  log.info(`[${requestId}] 🔄 GitHub webhook received`, {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries())
  });
  
  try {
    // Get the signature from the request headers
    const signature = request.headers.get('x-hub-signature-256');
    const event = request.headers.get('x-github-event');
    const delivery = request.headers.get('x-github-delivery');
    
    log.debug(`[${requestId}] Webhook headers`, { signature, event, delivery });
    
    if (!signature || !event) {
      const error = 'Missing required headers';
      log.error(`[${requestId}] ${error}`, { signature, event });
      return new Response(error, { status: 400 });
    }

    // Read the raw body for signature verification
    const payload = await request.text();
    log.debug(`[${requestId}] Webhook payload received`, { length: payload.length });
    
    // Verify the webhook signature
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!webhookSecret) {
      const error = 'GITHUB_WEBHOOK_SECRET is not set';
      log.error(`[${requestId}] ${error}`);
      return new Response('Server configuration error', { status: 500 });
    }

    if (!verifySignature(signature, payload, webhookSecret)) {
      const error = 'Invalid webhook signature';
      log.error(`[${requestId}] ${error}`, { signature });
      return new Response(error, { status: 401 });
    }

    const data = JSON.parse(payload);
    log.info(`[${requestId}] 📦 Processing webhook event: ${event}`, {
      repository: data.repository?.full_name,
      ref: data.ref,
      commits: data.commits?.length || 0
    });
    
    // Handle different GitHub events
    if (event === 'push') {
      log.info(`[${requestId}] 🚀 Handling push event`);
      const result = await handlePushEvent(data);
      log.info(`[${requestId}] 🏁 Push event processing completed`, {
        status: result.status,
        statusText: result.statusText
      });
      return result;
    }

    const message = `Unhandled event type: ${event}`;
    log.info(`[${requestId}] ⏩ ${message}`);
    return NextResponse.json({ 
      success: true, 
      message 
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`[${requestId}] ❌ Webhook processing failed`, error);
    return new Response(`Error processing webhook: ${errorMessage}`, { 
      status: 500,
      headers: {
        'X-Request-ID': requestId
      }
    });
  }
}

async function handlePushEvent(data: any): Promise<Response> {
  const requestId = Math.random().toString(36).substring(2, 8);
  const { repository, ref, commits } = data;
  const repoName = repository.name; // Use just the repository name without username
  const branch = ref.split('/').pop();
  
  log.info(`[${requestId}] 📥 Push event received`, {
    repository: repoName,
    full_name: repository.full_name,
    branch,
    commitCount: commits.length,
    commitIds: commits.map((c: any) => c.id.substring(0, 7))
  });
  
  // Only process pushes to main/master branches
  if (branch !== 'main' && branch !== 'master') {
    const message = `Skipping non-main branch: ${branch}`;
    log.info(`[${requestId}] ⏭️ ${message}`);
    return NextResponse.json({ 
      success: true, 
      message 
    });
  }

  // Get the database connection
  const db = new Client(process.env.DATABASE_URL!);
  await db.connect();
  log.debug(`[${requestId}] 🔌 Connected to database`);

  try {
    // Get or create repository record using just the repository name (without username)
    const repoName = repository.name;
    log.info(`[${requestId}] 🔍 Getting/Creating repository record`, { repoName });
    
    const { rows } = await db.query(
      `INSERT INTO repositories (name, full_name, github_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (github_id) 
       DO UPDATE SET 
         name = EXCLUDED.name,
         full_name = EXCLUDED.full_name,
         updated_at = NOW()
       RETURNING id`,
      [repoName, repository.full_name, repository.id]
    );
    
    const repoId = rows[0].id;
    log.info(`[${requestId}] 📌 Repository ID: ${repoId} for ${repoName}`);
    
    // Process each commit to get changed files
    const changedFiles = new Map<string, { action: 'added' | 'modified' | 'removed', sha?: string }>();
    let totalChangedFiles = 0;
    
    for (const commit of commits) {
      const commitId = commit.id.substring(0, 7);
      log.info(`[${requestId}] 📝 Processing commit: ${commitId} - ${commit.message}`, {
        author: commit.author?.name || 'Unknown',
        timestamp: commit.timestamp
      });
      
      try {
        // Get commit details to see the changes
        log.debug(`[${requestId}]   🔍 Fetching commit details for ${commitId}`);
        const commitResponse = await fetch(
          `https://api.github.com/repos/${repoName}/commits/${commit.id}`,
          {
            headers: {
              'Authorization': `token ${process.env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );
        
        if (!commitResponse.ok) {
          const error = await commitResponse.text();
          log.error(`[${requestId}] ❌ Failed to fetch commit ${commitId}`, { status: commitResponse.status, error });
          continue;
        }
        
        const commitData = await commitResponse.json();
        const changedFilesCount = commitData.files?.length || 0;
        totalChangedFiles += changedFilesCount;
        
        log.info(`[${requestId}]   📊 Found ${changedFilesCount} changed files in commit ${commitId}`);
        
        // Process each file in the commit
        for (const file of commitData.files || []) {
          const { filename, status, sha, changes, additions, deletions } = file;
          
          // Only process files with valid extensions
          const validExt = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rb', '.php', '.cs'];
          if (!validExt.some(ext => filename.endsWith(ext))) {
            log.debug(`[${requestId}]     ⏩ Skipping non-code file: ${filename}`);
            continue;
          }
          
          // Determine the action based on the status
          let action: 'added' | 'modified' | 'removed';
          if (status === 'added') action = 'added';
          else if (status === 'removed') action = 'removed';
          else action = 'modified';
          
          // Track the latest status for each file
          changedFiles.set(filename, { action, sha });
          log.debug(`[${requestId}]     - ${action.padEnd(8)} ${filename}`, {
            changes,
            additions,
            deletions,
            sha: sha?.substring(0, 7)
          });
        }
      } catch (error) {
        log.error(`[${requestId}] ❌ Error processing commit ${commit.id}`, error);
        continue;
      }
    }
    
    log.info(`[${requestId}] 📦 Preparing to process ${changedFiles.size} changed files (from ${totalChangedFiles} total changes)`);
    const fileChanges: FileChange[] = [];
    
    // Process each changed file
    for (const [path, { action, sha }] of changedFiles.entries()) {
      const fileLogPrefix = `[${requestId}] 📄 [${action.toUpperCase()}] ${path}`;
      log.info(`${fileLogPrefix} Processing...`);
      
      let content: string | undefined;
      if (action !== 'removed') {
        try {
          log.debug(`${fileLogPrefix} Fetching content...`);
          content = await fetchFileContent(repoName, path, sha);
          log.debug(`${fileLogPrefix} Fetched ${content.length} bytes`);
          
          // Log basic content stats
          const lineCount = content.split('\n').length;
          const contentPreview = content.length > 100 
            ? content.substring(0, 100) + '...' 
            : content;
            
          log.debug(`${fileLogPrefix} Content stats`, {
            size: content.length,
            lines: lineCount,
            preview: contentPreview
          });
          
        } catch (error) {
          log.error(`${fileLogPrefix} ❌ Failed to fetch content`, error);
          continue;
        }
      }
      
      fileChanges.push({
        path,
        action,
        sha,
        content
      });
      
      log.info(`${fileLogPrefix} ✅ Added to processing queue`);
    }
    
    log.info(`[${requestId}] 🚀 Starting documentation update for ${fileChanges.length} files`);
    
    try {
      // Import the updateDocumentation function dynamically to avoid circular dependencies
      log.debug(`[${requestId}] 🔄 Importing updateDocumentation function`);
      const { updateDocumentation } = await import('@/lib/gemini-docs');
      
      // Update documentation for changed files
      log.info(`[${requestId}] 📝 Updating documentation...`);
      const startTime = Date.now();
      
      const result = await updateDocumentation(
        repoId,
        repoName,
        fileChanges
      );
      
      const duration = Date.now() - startTime;
      
      log.success(`[${requestId}] ✅ Documentation update completed in ${duration}ms`, {
        updatedFiles: result.updatedFiles,
        totalChanges: result.totalChanges,
        message: result.message
      });
      
      return NextResponse.json({
        success: true,
        message: `Processed ${result.updatedFiles} updated files`,
        duration: `${duration}ms`,
        ...result
      });
      
    } catch (error) {
      log.error(`[${requestId}] ❌ Error in updateDocumentation`, error);
      throw error;
    }
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`[${requestId}] ❌ Error processing push event`, error);
    return new Response(`Error processing push event: ${errorMessage}`, { 
      status: 500,
      headers: {
        'X-Request-ID': requestId
      }
    });
  } finally {
    try {
      await db.end();
      log.debug(`[${requestId}] 🔌 Database connection closed`);
    } catch (error) {
      log.error(`[${requestId}] ❌ Error closing database connection`, error);
    }
  }
}

// Helper function to fetch file content from GitHub
async function fetchFileContent(repoName: string, path: string, ref?: string): Promise<string> {
  const url = `https://api.github.com/repos/${repoName}/contents/${encodeURIComponent(path)}${ref ? `?ref=${ref}` : ''}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3.raw'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch file content: ${response.statusText}`);
  }
  
  return await response.text();
}

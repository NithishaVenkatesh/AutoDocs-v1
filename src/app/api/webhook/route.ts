import { NextResponse } from "next/server";
import crypto from "crypto";
import { Client } from '@neondatabase/serverless';
import { sendSSEUpdate } from '@/lib/sse';

// Enhanced logging configuration
const log = {
  info: (requestId: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`[${timestamp}] [${requestId}] ℹ️ ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`[${timestamp}] [${requestId}] ℹ️ ${message}`);
    }
  },
  error: (requestId: string, message: string, error?: any) => {
    const timestamp = new Date().toISOString();
    if (error) {
      const errorInfo = error instanceof Error 
        ? `${error.message}\n${error.stack}` 
        : JSON.stringify(error, null, 2);
      console.error(`[${timestamp}] [${requestId}] ❌ ${message}\n${errorInfo}`);
    } else {
      console.error(`[${timestamp}] [${requestId}] ❌ ${message}`);
    }
  },
  success: (requestId: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${requestId}] ✅ ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  debug: (requestId: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    console.debug(`[${timestamp}] [${requestId}] 🔍 ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

interface FileChange {
  path: string;
  action: 'added' | 'modified' | 'removed';
  sha?: string;
  content?: string;
}

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).substring(2, 8);
  log.info(requestId, '🔄 GitHub webhook received');
  
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256") || "";
    const secret = process.env.GITHUB_WEBHOOK_SECRET || "";

    log.debug(requestId, 'Verifying webhook signature');
    
    // Verify signature
    const hmac = crypto.createHmac("sha256", secret);
    const digest = `sha256=${hmac.update(rawBody).digest("hex")}`;

    if (signature !== digest) {
      log.error(requestId, "Invalid GitHub signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = req.headers.get("x-github-event");
    const payload = JSON.parse(rawBody);

    log.success(requestId, `Webhook event: ${event}`, {
      repository: payload.repository?.full_name,
      ref: payload.ref
    });

    if (event === "ping") {
      log.info(requestId, 'Ping event received');
      return NextResponse.json({ msg: "pong" });
    }

    if (event === "push") {
      log.info(requestId, `📦 Push received on: ${payload.ref}`);
      
      try {
        // Process the push event
        const result = await handlePushEvent(requestId, payload);
        
        log.success(requestId, '🎉 Push event processing completed', result);
        return NextResponse.json(result);
      } catch (error) {
        log.error(requestId, '❌ Error in handlePushEvent', error);
        return NextResponse.json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        }, { status: 500 });
      }
    }

    if (event === "pull_request") {
      log.info(requestId, `🔀 Pull Request event: ${payload.action}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error(requestId, "Webhook error", err);
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}

async function handlePushEvent(requestId: string, payload: any) {
  log.info(requestId, '🚀 handlePushEvent STARTED');
  
  const { repository, ref, commits } = payload;
  
  if (!repository || !ref) {
    log.error(requestId, '❌ Missing repository or ref in payload', { repository, ref });
    throw new Error('Invalid payload: missing repository or ref');
  }
  
  const repoName = repository.full_name;
  const branch = ref.split('/').pop();
  
  log.info(requestId, '📥 Processing push event', {
    repository: repoName,
    branch,
    commitCount: commits?.length || 0,
    hasCommits: !!commits,
    commitsArray: commits
  });
  
  // Only process pushes to main/master branches
  if (branch !== 'main' && branch !== 'master') {
    const message = `Skipping non-main branch: ${branch}`;
    log.info(requestId, `⏭️ ${message}`);
    return { success: true, message };
  }

  // Get the database connection
  log.debug(requestId, '🔌 Connecting to database');
  
  if (!process.env.DATABASE_URL) {
    log.error(requestId, '❌ DATABASE_URL not set');
    throw new Error('DATABASE_URL environment variable is not set');
  }
  
  if (!process.env.GITHUB_TOKEN) {
    log.error(requestId, '❌ GITHUB_TOKEN not set');
    throw new Error('GITHUB_TOKEN environment variable is not set');
  }
  
  log.debug(requestId, '✅ Environment variables validated');
  
  const db = new Client(process.env.DATABASE_URL);
  await db.connect();
  log.success(requestId, '✅ Connected to database');

  try {
    // Get or create repository record
    log.info(requestId, '🔍 Getting/Creating repository record', { repoName });
    const { rows } = await db.query(
      `INSERT INTO repositories (name, full_name, github_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (github_id) 
       DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [repository.name, repository.full_name, repository.id]
    );
    
    const repoId = rows[0].id;
    log.success(requestId, `📌 Repository ID: ${repoId}`);
    
    // Process each commit to get changed files
    const changedFiles = new Map<string, { action: 'added' | 'modified' | 'removed', sha?: string }>();
    let totalChangedFiles = 0;
    
    log.info(requestId, `📝 Processing ${commits?.length || 0} commits`);
    
    for (const commit of commits || []) {
      const commitId = commit.id.substring(0, 7);
      log.info(requestId, `  📝 Commit ${commitId}: ${commit.message}`);
      
      try {
        // Get commit details to see the changes
        log.debug(requestId, `    🔍 Fetching commit details from GitHub API`);
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
          log.error(requestId, `    ❌ Failed to fetch commit ${commitId}`, { 
            status: commitResponse.status, 
            error 
          });
          continue;
        }
        
        const commitData = await commitResponse.json();
        const changedFilesCount = commitData.files?.length || 0;
        totalChangedFiles += changedFilesCount;
        
        log.info(requestId, `    📊 Found ${changedFilesCount} changed files`);
        
        // Process each file in the commit
        for (const file of commitData.files || []) {
          const { filename, status, sha, changes, additions, deletions } = file;
          
          // Only process files with valid extensions
          const validExt = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rb', '.php', '.cs'];
          if (!validExt.some(ext => filename.endsWith(ext))) {
            log.debug(requestId, `      ⏩ Skipping non-code file: ${filename}`);
            continue;
          }
          
          // Determine the action based on the status
          let action: 'added' | 'modified' | 'removed';
          if (status === 'added') action = 'added';
          else if (status === 'removed') action = 'removed';
          else action = 'modified';
          
          // Track the latest status for each file
          changedFiles.set(filename, { action, sha });
          log.info(requestId, `      📄 ${action.toUpperCase()}: ${filename}`, {
            changes,
            additions,
            deletions
          });
        }
      } catch (error) {
        log.error(requestId, `    ❌ Error processing commit ${commit.id}`, error);
        continue;
      }
    }
    
    log.info(requestId, `📦 Total unique files to process: ${changedFiles.size}`);
    
    if (changedFiles.size === 0) {
      log.info(requestId, '⚠️ No code files changed, skipping documentation update');
      
      // Send SSE update for no changes
      sendSSEUpdate({
        type: 'documentation_complete',
        repoName: repository.name,
        status: 'complete',
        message: 'No documentation changes needed',
        progress: 100
      });
      
      return { 
        success: true, 
        message: 'No code files changed',
        updatedFiles: 0 
      };
    }
    
    const fileChanges: FileChange[] = [];
    
    // Fetch content for each changed file
    log.info(requestId, '🌐 Streaming files from GitHub to Neon');
    for (const [path, { action, sha }] of changedFiles.entries()) {
      const fileLogPrefix = `  📄 [${action.toUpperCase()}] ${path}`;
      log.info(requestId, `${fileLogPrefix} - Streaming...`);
      
      let content: string | undefined;
      if (action !== 'removed') {
        try {
          log.debug(requestId, `${fileLogPrefix} - Fetching from GitHub API`, {
            path,
            sha: sha?.substring(0, 7),
            url: sha 
              ? `https://api.github.com/repos/${repoName}/git/blobs/${sha}`
              : `https://api.github.com/repos/${repoName}/contents/${path}`
          });
          content = await fetchFileContent(repoName, path, sha);
          
          const lineCount = content.split('\n').length;
          log.success(requestId, `${fileLogPrefix} - Streamed ${content.length} bytes (${lineCount} lines)`);
          
        } catch (error) {
          log.error(requestId, `${fileLogPrefix} - Failed to fetch`, error);
          // Continue processing other files even if one fails
          continue;
        }
      }
      
      fileChanges.push({
        path,
        action,
        sha,
        content
      });
    }
    
    log.info(requestId, `✅ Streamed ${fileChanges.length} files to Neon`);
    log.info(requestId, '🔪 Starting chunking and Merkle tree generation');
    
    try {
      // Import the updateDocumentation function
      log.debug(requestId, '🔄 Importing updateDocumentation function');
      const { updateDocumentation } = await import('@/lib/gemini-docs-fixed');
      
      // Update documentation for changed files
      log.info(requestId, '📝 Generating documentation for changed files');
      const startTime = Date.now();
      
      const result = await updateDocumentation(
        repoId,
        repoName,
        fileChanges
      );
      
      const duration = Date.now() - startTime;
      
      log.success(requestId, `🎉 Documentation update completed in ${duration}ms`, {
        updatedFiles: result.updatedFiles,
        totalChanges: result.totalChanges
      });
      
      // Send SSE update to notify frontend
      console.log(`[Webhook] Sending SSE update for completed documentation: ${repoName}`);
      sendSSEUpdate({
        type: 'documentation_complete',
        repoName: repository.name, // Use just the repo name, not full name
        status: 'complete',
        message: 'Documentation regenerated successfully',
        progress: 100
      });
      
      return {
        success: true,
        message: `Processed ${result.updatedFiles} files`,
        duration: `${duration}ms`,
        updatedFiles: result.updatedFiles,
        totalChanges: result.totalChanges
      };
      
    } catch (error) {
      log.error(requestId, '❌ Error in updateDocumentation', error);
      
      // Send SSE update for error
      console.log(`[Webhook] Sending SSE update for failed documentation: ${repoName}`);
      sendSSEUpdate({
        type: 'documentation_error',
        repoName: repository.name, // Use just the repo name, not full name
        status: 'error',
        message: `Failed to generate documentation: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      
      throw error;
    }
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(requestId, '❌ Error processing push event', error);
    throw error;
  } finally {
    try {
      await db.end();
      log.debug(requestId, '🔌 Database connection closed');
    } catch (error) {
      log.error(requestId, '❌ Error closing database connection', error);
    }
  }
}

// Helper function to fetch file content from GitHub
async function fetchFileContent(repoName: string, path: string, ref?: string): Promise<string> {
  // Use the commit SHA as ref if provided, otherwise use the default branch
  const url = ref 
    ? `https://api.github.com/repos/${repoName}/git/blobs/${ref}`
    : `https://api.github.com/repos/${repoName}/contents/${encodeURIComponent(path)}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN}`,
      'Accept': ref ? 'application/vnd.github.v3.raw' : 'application/vnd.github.v3.raw'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch file content (${response.status}): ${errorText}`);
  }
  
  return await response.text();
}

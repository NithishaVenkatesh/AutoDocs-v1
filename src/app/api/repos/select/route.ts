import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { NextResponse } from "next/server";
import { Client } from "@neondatabase/serverless";
import { generateDocumentation } from "@/lib/gemini-docs";

// Common directories and files to exclude (case insensitive)
const EXCLUDED_PATTERNS = [
  /^\/\.git(\/|$)/i,         // .git directory
  /\/node_modules\//i,        // node_modules
  /\/dist\//i,               // build output
  /\/build\//i,              // build output
  /\/\.next\//i,             // Next.js build
  /\/out\//i,                // output directories
  /\.(gitignore|gitkeep|gitattributes)$/i, // git related files
  /\.(lock|log|tmp|temp|DS_Store)$/i, // system files
  /\/\..*$/i,                // hidden files/directories
  /\/(test|tests|__tests__|spec|specs|coverage|cypress|e2e)\//i, // test files
  /\.(jpg|jpeg|png|gif|svg|webp|ico|mp4|webm|wav|mp3|m4a|aac|oga|woff|woff2|ttf|eot|otf|zip|gz|rar|7z|tar|pdf|docx?|xlsx?|pptx?|avif|webmanifest|wasm|bin|dll|exe)$/i, // binary files
];

// Function to check if a path should be excluded
function shouldExcludePath(path: string): boolean {
  return EXCLUDED_PATTERNS.some(pattern => pattern.test(path));
}

// Function to create a GitHub webhook for the repository
async function createWebhook(userId: string, repo: any) {
  const logPrefix = `[WEBHOOK] [${repo.full_name}]`;
  
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${logPrefix} 🔄 Starting webhook creation process`);
    console.log(`${logPrefix} Repository ID: ${repo.id}`);
    console.log(`${logPrefix} User ID: ${userId}`);
    
    // Get GitHub token
    console.log(`${logPrefix} 🔑 Fetching GitHub token from Clerk...`);
    const tokensRes = await clerkClient.users.getUserOauthAccessToken(userId, "github");
    const githubToken = tokensRes?.data?.[0];
    
    if (!githubToken) {
      console.error(`${logPrefix} ❌ No GitHub token found for user`);
      console.error(`${logPrefix} ❌ Webhook creation FAILED - Missing token`);
      return;
    }
    console.log(`${logPrefix} ✅ GitHub token retrieved successfully`);
    
    // Determine the webhook URL - use /api/webhook for the main endpoint
    const webhookUrl = `${process.env.PUBLIC_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhook`;
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || '';
    
    if (!webhookSecret) {
      console.error(`${logPrefix} ❌ GITHUB_WEBHOOK_SECRET is not set in environment`);
      console.error(`${logPrefix} ❌ Webhook creation FAILED - Missing secret`);
      return;
    }
    
    console.log(`${logPrefix} 🌐 Webhook URL: ${webhookUrl}`);
    console.log(`${logPrefix} 🔐 Webhook secret: ${webhookSecret.substring(0, 10)}...`);
    console.log(`${logPrefix} 📡 Sending webhook creation request to GitHub...`);
    
    // Create the webhook
    const webhookResponse = await fetch(
      `https://api.github.com/repos/${repo.full_name}/hooks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'web',
          active: true,
          events: ['push'],
          config: {
            url: webhookUrl,
            content_type: 'json',
            insecure_ssl: '0',
            secret: webhookSecret
          }
        })
      }
    );
    
    console.log(`${logPrefix} 📊 GitHub API Response Status: ${webhookResponse.status} ${webhookResponse.statusText}`);
    
    if (!webhookResponse.ok) {
      const error = await webhookResponse.json();
      console.error(`${logPrefix} ❌ Webhook creation FAILED on GitHub`);
      console.error(`${logPrefix} ❌ Error: ${JSON.stringify(error, null, 2)}`);
      
      // Update repo with webhook error
      console.log(`${logPrefix} 💾 Saving error to Neon database...`);
      const db = new Client(process.env.DATABASE_URL);
      await db.connect();
      try {
        await db.query(
          'UPDATE repos SET webhook_error = $1 WHERE id = $2',
          [error.message || 'Failed to create webhook', repo.id]
        );
        console.log(`${logPrefix} ✅ Error saved to database`);
      } finally {
        await db.end();
      }
      console.log(`${'='.repeat(80)}\n`);
      return;
    }
    
    const webhookData = await webhookResponse.json();
    console.log(`${logPrefix} ✅ Webhook created successfully on GitHub!`);
    console.log(`${logPrefix} 🆔 Webhook ID: ${webhookData.id}`);
    console.log(`${logPrefix} 🔗 Webhook URL: ${webhookData.config.url}`);
    console.log(`${logPrefix} 📋 Events: ${webhookData.events.join(', ')}`);
    console.log(`${logPrefix} 🟢 Active: ${webhookData.active}`);
    
    // Update the repo with webhook ID
    console.log(`${logPrefix} 💾 Saving webhook ID to Neon database...`);
    const db = new Client(process.env.DATABASE_URL);
    await db.connect();
    try {
      await db.query(
        'UPDATE repos SET webhook_id = $1, webhook_error = NULL WHERE id = $2',
        [webhookData.id.toString(), repo.id]
      );
      console.log(`${logPrefix} ✅ Webhook ID saved to database successfully`);
      console.log(`${logPrefix} 📊 Database record updated: webhook_id=${webhookData.id}, webhook_error=NULL`);
    } finally {
      await db.end();
    }
    
    console.log(`${logPrefix} 🎉 Webhook setup completed successfully!`);
    console.log(`${'='.repeat(80)}\n`);
    
  } catch (error) {
    console.error(`${logPrefix} ❌ EXCEPTION during webhook creation`);
    console.error(`${logPrefix} ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(`${logPrefix} Stack trace: ${error.stack}`);
    }
    
    // Update repo with webhook error
    try {
      console.log(`${logPrefix} 💾 Attempting to save error to database...`);
      const db = new Client(process.env.DATABASE_URL);
      await db.connect();
      try {
        await db.query(
          'UPDATE repos SET webhook_error = $1 WHERE id = $2',
          [error instanceof Error ? error.message : 'Failed to create webhook', repo.id]
        );
        console.log(`${logPrefix} ✅ Error saved to database`);
      } finally {
        await db.end();
      }
    } catch (dbError) {
      console.error(`${logPrefix} ❌ Failed to save error to database:`, dbError);
    }
    console.log(`${'='.repeat(80)}\n`);
  }
}

// Function to fetch and store repository contents recursively
async function fetchAndStoreRepoContents(owner: string, repo: string, repoId: number, githubToken: string, path: string = '') {
  const fullPath = path ? `/${path}` : '';
  
  // Skip excluded paths
  if (shouldExcludePath(fullPath)) {
    console.log(`Skipping excluded path: ${fullPath}`);
    return;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents${fullPath}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch contents for ${fullPath}:`, await response.text());
      return;
    }

    const contents = await response.json();
    if (!Array.isArray(contents)) return;

    // Create database client for this operation
    const db = new Client(process.env.DATABASE_URL);
    await db.connect();

    try {
      // Create table if it doesn't exist
      await db.query(`
        CREATE TABLE IF NOT EXISTS repo_contents (
          id SERIAL PRIMARY KEY,
          repo_id INTEGER NOT NULL,
          file_path TEXT NOT NULL,
          file_name TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          sha TEXT NOT NULL,
          content TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(repo_id, file_path)
        )
      `);

      // Process each item
      for (const item of contents) {
        if (shouldExcludePath(item.path)) continue;

        if (item.type === 'dir') {
          // Process directories recursively
          await fetchAndStoreRepoContents(owner, repo, repoId, githubToken, item.path);
        } else if (item.type === 'file' && item.size > 0) {
          try {
            // Skip large files (>5MB)
            if (item.size > 5 * 1024 * 1024) {
              console.log(`Skipping large file: ${item.path} (${(item.size / 1024 / 1024).toFixed(2)}MB)`);
              continue;
            }

            // Fetch file content
            const contentRes = await fetch(item.download_url, {
              headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3.raw',
              },
            });

            let content = null;
            if (contentRes.ok) {
              content = await contentRes.text();
            } else {
              console.warn(`Failed to fetch content for ${item.path}: ${contentRes.status} ${contentRes.statusText}`);
            }

            // Store file in database
            await db.query(
              `INSERT INTO repo_contents 
               (repo_id, file_path, file_name, file_size, sha, content, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())
               ON CONFLICT (repo_id, file_path) 
               DO UPDATE SET 
                 file_size = EXCLUDED.file_size,
                 sha = EXCLUDED.sha,
                 content = EXCLUDED.content,
                 updated_at = NOW()
              `,
              [repoId, item.path, item.name, item.size, item.sha, content]
            );

            console.log(`Processed: ${item.path}`);
          } catch (error) {
            console.error(`Error processing file ${item.path}:`, error);
          }
        }
      }
    } finally {
      await db.end().catch(console.error);
    }
  } catch (error) {
    console.error(`Error in fetchAndStoreRepoContents for ${fullPath}:`, error);
  }
}

// Helper function to handle database connections
async function withDatabase<T>(callback: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client(process.env.DATABASE_URL);
  try {
    await db.connect();
    return await callback(db);
  } finally {
    await db.end().catch(console.error);
  }
}

// Helper function to run documentation generation in the background
async function triggerDocumentationGeneration(repo: any) {
  const startTime = Date.now();
  const logId = `[${new Date().toISOString()}] [Repo: ${repo.full_name || repo.name}]`;
  
  try {
    console.log(`\n${logId} Starting documentation generation`);
    console.log(`${logId} Repository: ${repo.full_name || repo.name}`);
    console.log(`${logId} URL: ${repo.html_url || repo.clone_url}`);
    
    const result = await generateDocumentation(repo.clone_url || repo.html_url);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (result.success) {
      console.log(`\n${logId} Documentation generated successfully in ${duration}s`);
      console.log(`${logId} Merkle root: ${result.merkleRoot || 'N/A'}`);
      if (result.fileHashes) {
        console.log(`${logId} Files hashed: ${result.fileHashes.length}`);
      }
    } else {
      console.error(`\n${logId} Documentation generation failed after ${duration}s`);
      console.error(`${logId} Error: ${result.error || 'Unknown error'}`);
    }
    
    // Update the repository status in the database
    await withDatabase(async (db) => {
      await db.query(
        'UPDATE repos SET last_doc_gen = $1, doc_gen_status = $2 WHERE id = $3',
        [new Date(), result.success ? 'success' : 'failed', repo.id]
      );
    }).catch(console.error);
    
    return result;
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`\n${logId} Fatal error after ${duration}s:`, error);
    
    // Log the error to the database
    await withDatabase(async (db) => {
      await db.query(
        'UPDATE repos SET last_doc_gen = $1, doc_gen_status = $2, last_error = $3 WHERE id = $4',
        [
          new Date(),
          'failed',
          error instanceof Error ? error.message : String(error),
          repo.id
        ]
      );
    }).catch(console.error);
    
    return {
      success: false,
      message: 'Unexpected error during documentation generation',
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    console.log(`${logId} Documentation generation process completed\n`);
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { repo } = await req.json();
  if (!repo?.id || !repo?.name) {
    return NextResponse.json({ error: "Invalid repo payload" }, { status: 400 });
  }

  // Ensure we have the required properties with fallbacks
  const repoData = {
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name || repo.name,
    html_url: repo.html_url || repo.clone_url || `https://github.com/${repo.full_name || repo.name}`,
    clone_url: repo.clone_url || repo.html_url || `https://github.com/${repo.full_name || repo.name}.git`,
    description: repo.description || '',
    language: repo.language || '',
    stargazers_count: repo.stargazers_count || 0,
    forks_count: repo.forks_count || 0,
    open_issues_count: repo.open_issues_count || 0,
    topics: repo.topics || [],
    updated_at: repo.updated_at || new Date().toISOString()
  };

  const tokensRes = await clerkClient.users.getUserOauthAccessToken(userId, "github");
  const githubToken = tokensRes?.data?.[0];
  if (!githubToken) return NextResponse.json({ error: "No GitHub token found" }, { status: 404 });

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  try {
    // First, check if the repo already exists
    const existingRepo = await db.query(
      `SELECT * FROM repos WHERE github_repo_id = $1 AND clerk_user_id = $2`,
      [repoData.id, userId]
    );

      // If repo exists, return it without creating a new webhook
      if (existingRepo.rows.length > 0) {
        const existing = existingRepo.rows[0];
        const fullName = existing.full_name || existing.name;
        const htmlUrl = existing.html_url || `https://github.com/${fullName}`;
        
        return NextResponse.json({ 
          repo: {
            id: existing.github_repo_id || existing.id,
            name: existing.name,
            full_name: fullName,
            description: existing.description || '',
            language: existing.language || '',
            stargazers_count: existing.stargazers_count || 0,
            forks_count: existing.forks_count || 0,
            open_issues_count: existing.open_issues_count || 0,
            topics: Array.isArray(existing.topics) ? existing.topics : [],
            updated_at: existing.updated_at || new Date().toISOString(),
            html_url: htmlUrl,
            clone_url: htmlUrl ? `${htmlUrl}.git` : ''
          },
          message: "Repository already exists" 
        });
      }

    // Insert the new repo with only the columns that exist
    const insertQuery = `
      INSERT INTO repos (
        clerk_user_id, 
        github_repo_id, 
        name, 
        full_name
      ) VALUES (
        $1, $2, $3, $4
      )
      RETURNING id, github_repo_id, name, full_name`;

    // Extract just the repo name if full_name is in format 'username/repo'
    const repoName = repo.full_name ? repo.full_name.split('/').pop() : repo.name;
    
    const result = await db.query(insertQuery, [
      userId,
      repo.id,
      repoName,  // Store just the repo name
      repoName   // Store same in full_name for consistency
    ]);
    
    console.log(`📝 Storing repository in database as: ${repoName} (from ${repo.full_name || repo.name})`);
    
    const savedRepo = result.rows[0];
    const fullName = savedRepo.full_name || savedRepo.name;
    const htmlUrl = savedRepo.html_url || `https://github.com/${fullName}`;

    // Start background tasks
    try {
      // Create webhook in background (also in development if PUBLIC_WEBHOOK_BASE_URL is set)
      if (repo.full_name) {
        createWebhook(userId, repo).catch(console.error);  // Pass original repo, not savedRepo
      }

      // Fetch and store repo contents, then generate documentation
      if (githubToken?.token) {
        const [owner, repoName] = repo.full_name.split('/');
        if (owner && repoName) {
          console.log(`\n🔄 Starting to process repository: ${repo.full_name}`);
          fetchAndStoreRepoContents(owner, repoName, savedRepo.id, githubToken.token)
            .then(() => {
              console.log(`\n✅ Finished storing repository contents: ${repo.full_name}`);
              console.log('🚀 Starting documentation generation...');
              return generateDocumentation(savedRepo.id);
            })
            .then(result => {
              if (result.success) {
                console.log(`\n🎉 Successfully generated documentation for ${repo.full_name}`);
                console.log(`   - Processed ${result.processedFiles} files`);
                if (result.totalFiles) {
                  console.log(`   - Total files in repo: ${result.totalFiles}`);
                }
                if (result.timeTaken) {
                  console.log(`   - Time taken: ${result.timeTaken}`);
                }
              } else {
                console.error(`\n❌ Documentation generation failed: ${result.message || 'Unknown error'}`);
              }
            })
            .catch(error => {
              console.error('\n❌ Error in repository processing pipeline:', error);
            });
        }
      }
    } catch (error) {
      console.error('Error in background tasks:', error);
    }

    // Return response immediately
    return NextResponse.json({ 
      repo: {
        id: savedRepo.github_repo_id || savedRepo.id,
        name: savedRepo.name,
        full_name: fullName,
        html_url: htmlUrl,
        clone_url: htmlUrl ? `${htmlUrl}.git` : ''
      },
      message: 'Repository added successfully. Background sync in progress.'
    });
  } catch (error) {
    console.error('Error in repo selection:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to save repository',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : String(error)) : undefined
      },
      { status: 500 }
    );
  } finally {
    await db.end().catch(console.error);
  }
}

// create-webhooks.js - Manually create webhooks for all repositories
import { Client } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { clerkClient } from "@clerk/clerk-sdk-node";

dotenv.config();

const db = new Client({ connectionString: process.env.DATABASE_URL });

async function createWebhooksForAllRepos() {
  try {
    await db.connect();
    console.log("✅ Connected to database\n");

    // Validate environment variables
    if (!process.env.GITHUB_TOKEN) {
      console.error("❌ GITHUB_TOKEN is not set in .env.local");
      return;
    }

    if (!process.env.GITHUB_WEBHOOK_SECRET) {
      console.error("❌ GITHUB_WEBHOOK_SECRET is not set in .env.local");
      return;
    }

    const webhookUrl = process.env.PUBLIC_WEBHOOK_BASE_URL 
      ? `${process.env.PUBLIC_WEBHOOK_BASE_URL}/api/webhook`
      : (process.env.NEXT_PUBLIC_APP_URL 
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook`
        : 'https://auto-docs-v1.vercel.app/api/webhook');

    console.log(`🔗 Webhook URL: ${webhookUrl}\n`);

    // Get all repos without webhooks
    const result = await db.query(`
      SELECT id, name, full_name, webhook_id, clerk_user_id
      FROM repos
      WHERE full_name IS NOT NULL
      ORDER BY id
    `);

    if (result.rows.length === 0) {
      console.log("❌ No repositories found");
      return;
    }

    console.log(`📊 Processing ${result.rows.length} repositories...\n`);

    for (const repo of result.rows) {
      console.log(`\n📦 Repository: ${repo.full_name}`);

      // Skip if webhook already exists
      if (repo.webhook_id) {
        console.log(`   ⏭️  Webhook already exists (ID: ${repo.webhook_id})`);
        continue;
      }

      try {
        // Get user's GitHub token from Clerk
        let githubToken = process.env.GITHUB_TOKEN;
        
        if (repo.clerk_user_id) {
          try {
            const tokensRes = await clerkClient.users.getUserOauthAccessToken(
              repo.clerk_user_id, 
              "github"
            );
            if (tokensRes?.data?.[0]?.token) {
              githubToken = tokensRes.data[0].token;
              console.log(`   ✅ Using user's GitHub token`);
            }
          } catch (error) {
            console.log(`   ⚠️  Could not get user token, using GITHUB_TOKEN from env`);
          }
        }

        // Create webhook
        console.log(`   🔄 Creating webhook...`);
        const webhookResponse = await fetch(
          `https://api.github.com/repos/${repo.full_name}/hooks`,
          {
            method: 'POST',
            headers: {
              'Authorization': `token ${githubToken}`,
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
                secret: process.env.GITHUB_WEBHOOK_SECRET
              }
            })
          }
        );

        if (!webhookResponse.ok) {
          const error = await webhookResponse.json();
          console.log(`   ❌ Failed: ${error.message}`);
          
          // Check if webhook already exists
          if (error.errors && error.errors.some(e => e.message.includes('Hook already exists'))) {
            console.log(`   ℹ️  Webhook already exists on GitHub, fetching ID...`);
            
            // Get existing webhooks
            const hooksResponse = await fetch(
              `https://api.github.com/repos/${repo.full_name}/hooks`,
              {
                headers: {
                  'Authorization': `token ${githubToken}`,
                  'Accept': 'application/vnd.github.v3+json',
                }
              }
            );
            
            if (hooksResponse.ok) {
              const hooks = await hooksResponse.json();
              const existingHook = hooks.find(h => h.config.url === webhookUrl);
              
              if (existingHook) {
                console.log(`   ✅ Found existing webhook (ID: ${existingHook.id})`);
                await db.query(
                  'UPDATE repos SET webhook_id = $1, webhook_error = NULL WHERE id = $2',
                  [existingHook.id.toString(), repo.id]
                );
                console.log(`   ✅ Updated database with webhook ID`);
                continue;
              }
            }
          }
          
          // Update with error
          await db.query(
            'UPDATE repos SET webhook_error = $1 WHERE id = $2',
            [error.message || 'Failed to create webhook', repo.id]
          );
          continue;
        }

        const webhookData = await webhookResponse.json();
        console.log(`   ✅ Webhook created successfully (ID: ${webhookData.id})`);

        // Update database
        await db.query(
          'UPDATE repos SET webhook_id = $1, webhook_error = NULL WHERE id = $2',
          [webhookData.id.toString(), repo.id]
        );
        console.log(`   ✅ Database updated`);

      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        await db.query(
          'UPDATE repos SET webhook_error = $1 WHERE id = $2',
          [error.message, repo.id]
        );
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n✅ Webhook creation process completed!");
    console.log("\n💡 Run 'node check-webhooks.js' to verify webhooks were created");

  } catch (error) {
    console.error("❌ Fatal error:", error);
  } finally {
    await db.end();
  }
}

createWebhooksForAllRepos();

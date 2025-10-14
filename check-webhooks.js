// check-webhooks.js - Check and create webhooks for repositories
import { Client } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config();

const db = new Client({ connectionString: process.env.DATABASE_URL });

async function checkWebhooks() {
  try {
    await db.connect();
    console.log("✅ Connected to database\n");

    // Get all repos
    const result = await db.query(`
      SELECT id, name, full_name, webhook_id, webhook_error, clerk_user_id
      FROM repos
      ORDER BY id
    `);

    if (result.rows.length === 0) {
      console.log("❌ No repositories found in database");
      return;
    }

    console.log(`📊 Found ${result.rows.length} repositories:\n`);

    for (const repo of result.rows) {
      console.log(`\n📦 Repository: ${repo.full_name || repo.name}`);
      console.log(`   ID: ${repo.id}`);
      console.log(`   Webhook ID: ${repo.webhook_id || '❌ NOT SET'}`);
      console.log(`   Webhook Error: ${repo.webhook_error || '✅ None'}`);

      // Check if webhook exists on GitHub
      if (repo.webhook_id && repo.full_name) {
        try {
          const webhookUrl = `https://api.github.com/repos/${repo.full_name}/hooks/${repo.webhook_id}`;
          const response = await fetch(webhookUrl, {
            headers: {
              'Authorization': `token ${process.env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
            }
          });

          if (response.ok) {
            const webhook = await response.json();
            console.log(`   ✅ Webhook exists on GitHub`);
            console.log(`   URL: ${webhook.config.url}`);
            console.log(`   Events: ${webhook.events.join(', ')}`);
            console.log(`   Active: ${webhook.active}`);
          } else {
            console.log(`   ❌ Webhook NOT found on GitHub (may have been deleted)`);
          }
        } catch (error) {
          console.log(`   ⚠️  Error checking webhook: ${error.message}`);
        }
      } else if (!repo.webhook_id) {
        console.log(`   ⚠️  No webhook configured for this repository`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n💡 To create webhooks manually, run: node create-webhooks.js");
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await db.end();
  }
}

checkWebhooks();

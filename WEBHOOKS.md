# GitHub Webhook Integration

This document explains how to set up and use GitHub webhooks for automatic documentation updates.

## Prerequisites

1. A running instance of the documentation server
2. A public URL for your server (you can use ngrok for local testing)
3. A GitHub repository with the code you want to document

## Setup Instructions

### 1. Configure Environment Variables

Add these environment variables to your `.env.local` file:

```bash
# GitHub App or Personal Access Token with repo access
GITHUB_TOKEN=your_github_token_here

# Secret for verifying webhook payloads (generate a random string)
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here

# Your Neon database URL
DATABASE_URL=your_neon_database_url_here
```

### 2. Set Up the Webhook in GitHub

1. Go to your GitHub repository
2. Click on "Settings" > "Webhooks" > "Add webhook"
3. Configure the webhook with these settings:
   - **Payload URL**: `https://your-domain.com/api/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: The same as `GITHUB_WEBHOOK_SECRET` in your .env file
   - **Events**: Select "Let me select individual events" and choose:
     - Push
     - Pull request (optional)

### 3. Test the Webhook

1. Make a change to a file in your repository and push it
2. Check your server logs for webhook processing
3. The documentation should update automatically for the changed files

## How It Works

1. When you push changes to your repository, GitHub sends a webhook to your server
2. The server verifies the webhook signature using the shared secret
3. The system processes each changed file:
   - For new or modified files: Fetches the content and generates documentation
   - For deleted files: Removes the corresponding documentation
4. Only the changed files are processed, making updates efficient
5. Each document is versioned, allowing you to track changes over time

## Troubleshooting

### Webhook Delivery Failing
- Check that your server is accessible from the internet
- Verify the webhook secret matches between GitHub and your .env file
- Check server logs for detailed error messages

### Documentation Not Updating
- Ensure the file extensions are in the allowed list
- Check that the GitHub token has the necessary permissions
- Look for errors in the server logs

### Database Issues
- Make sure the database tables are properly created
- Verify the database user has the necessary permissions
- Check for any schema migration errors in the logs

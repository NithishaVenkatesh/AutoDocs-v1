# Merkle Tree-based Documentation System

This system provides a way to track changes in documentation files using a Merkle tree data structure. It allows for efficient verification of file integrity and detection of changes.

## Features

- **Change Detection**: Automatically detects added, modified, and deleted files
- **Efficient Verification**: Quickly verify if a file has been modified using Merkle proofs
- **Webhook Integration**: GitHub webhook integration for automatic updates
- **Status Tracking**: Track documentation generation status in real-time

## How It Works

1. **Initial Generation**:
   - When documentation is first generated, a Merkle tree is created from all source files
   - Each file's content is hashed, and these hashes form the leaves of the tree
   - The root hash and file hashes are stored in `.merkle.json`

2. **Change Detection**:
   - When changes are detected (via webhook or manual trigger), the system:
     1. Scans the repository for changes
     2. Identifies added, modified, and deleted files
     3. Updates the Merkle tree with the new file hashes
     4. Stores the new root hash and file hashes

3. **Verification**:
   - Any file's integrity can be verified by:
     1. Hashing the file content
     2. Rebuilding the Merkle proof
     3. Verifying against the stored root hash

## API Endpoints

### Webhook Endpoint

`POST /api/webhook/github`

Processes GitHub webhook events and updates documentation when changes are detected.

**Headers:**
- `x-hub-signature-256`: GitHub webhook signature for verification
- `x-github-event`: GitHub event type (e.g., 'push')

### Status Endpoint

`GET /api/status/:repoId`

Gets the current status of documentation generation for a repository.

**Parameters:**
- `repoId`: The ID of the repository

## Usage

### 1. Generate Documentation with Merkle Tree

```typescript
import { generateDocumentationWithMerkle } from '@/lib/documentation';

const { merkleRoot, fileHashes } = await generateDocumentationWithMerkle(
  '/path/to/repo',
  '/path/to/output',
  ['**/node_modules/**', '**/.git/**'] // Optional exclude patterns
);
```

### 2. Verify File Integrity

```typescript
import { verifyDocumentation } from '@/lib/documentation';

const isValid = await verifyDocumentation(
  '/path/to/output',
  '/path/to/output/some-file.md'
);
```

### 3. Get Changed Files

```typescript
import { getChangedFiles } from '@/lib/documentation';

const changedFiles = await getChangedFiles('/path/to/repo');
// Returns: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>
```

## Setup Webhook in GitHub

1. Go to your repository settings
2. Navigate to "Webhooks" > "Add webhook"
3. Set the Payload URL to `https://your-domain.com/api/webhook/github`
4. Set Content type to `application/json`
5. Add a secret (set the same secret as `GITHUB_WEBHOOK_SECRET` in your environment variables)
6. Select "Just the push event"
7. Click "Add webhook"

## Environment Variables

```bash
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
```

## Security Considerations

- Always use HTTPS for webhook endpoints
- Validate webhook signatures to ensure requests are from GitHub
- Store secrets (like `GITHUB_WEBHOOK_SECRET`) in environment variables, not in code
- Limit repository access to trusted repositories only

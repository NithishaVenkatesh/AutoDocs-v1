import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { MerkleTree } from './merkle-utils';
import { DocumentationMerkleTree } from './merkle-tree';
import { setGenerationStatus } from './documentation';

const execAsync = promisify(exec);

// Robust command execution with timeout
function executeCommandWithTimeout(command: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      shell: true,
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let isResolved = false;

    // Set up timeout
    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        child.kill('SIGKILL');
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    // Collect output
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle completion
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (!isResolved) {
        isResolved = true;
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with exit code ${code}. Stderr: ${stderr}`));
        }
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      if (!isResolved) {
        isResolved = true;
        reject(error);
      }
    });
  });
}

// Define default exclude patterns
const DEFAULT_EXCLUDE_PATTERNS = [
  // Version control and IDE files
  '*.git/*', '*.github/*', '*.next/*', '*.vscode/*', '*.idea/*',
  'node_modules/*', 'venv/*', '*.venv/*', '*__pycache__/*', '*.pytest_cache/*',
  'dist/*', 'build/*', 'bin/*', 'obj/*', '*.egg-info/*',
  
  // Binary files
  '*.png', '*.jpg', '*.jpeg', '*.gif', '*.bmp', '*.ico', '*.svg', '*.pdf',
  '*.zip', '*.tar.gz', '*.tar', '*.gz', '*.7z', '*.rar', '*.exe', '*.dll', 
  '*.so', '*.dylib', '*.class', '*.pyc', '*.pyo', '*.pyd', '*.pyz', '*.pyw',
  '*.jar', '*.war', '*.ear', '*.apk', '*.a', '*.o', '*.obj', '*.lib', '*.dylib',
  '*.ncb', '*.sdf', '*.suo', '*.pch', '*.idb', '*.pdb', '*.res', '*.tlb', '*.tlh',
  '*.tmp', '*.temp', '*.swp', '*.swo', '*.swn', '*.swm', '*.log', '*.toc', '*.out',
  
  // Environment and configuration files
  '.env*', '.pytest_cache/*', '.mypy_cache/*', '.coverage', 'coverage.xml',
  '*.cover', '.hypothesis', '.pytest_cache', '*.mo', '*.pot', '*.log',
  'local_settings.py', 'db.sqlite3', 'db.sqlite3-journal', 'instance/*',
  '.webassets-cache', '.scrapy', 'docs/_build/*', 'target/*', '.ipynb_checkpoints/*',
  '.python-version', 'celerybeat-schedule', '*.sage.py', '.env', '.venv', 'env/',
  'venv/', 'ENV/', 'env.bak/', 'venv.bak/', '.spyderproject', '.spyproject',
  
  // Testing and coverage
  'htmlcov/', '.tox/', '.nox/', '.coverage', '.coverage.*', '.cache',
  'nosetests.xml', 'coverage.xml', '*.cover', '*.py,cover', '.hypothesis/',
  '.pytest_cache/', 'cover/', '.mypy_cache/', '.dmypy.json', 'dmypy.json',
  
  // Project specific
  'PocketFlow-Tutorial-Codebase-Knowledge/output/*', 'output/*', '*.md', '*.mdx',
  '*.markdown', '*.txt', '*.rst', '*.json', '*.yaml', '*.yml', '*.toml', '*.ini',
  '*.cfg', '*.conf', '*.log', '*.sql', '*.sqlite', '*.db', '*.csv', '*.tsv',
  '*.xls', '*.xlsx', '*.doc', '*.docx', '*.ppt', '*.pptx', '*.odt', '*.ods', '*.odp'
];

type DocumentationResult = 
  | { 
      success: true;
      message: string;
      output?: any;
      merkleRoot: string;
      fileHashes: Array<{ path: string; hash: string }>;
    }
  | { 
      success: false;
      message: string;
      error?: string;
      merkleRoot?: string;
      fileHashes?: Array<{ path: string; hash: string }>;
    };

/**
 * Generates documentation for a given repository URL using PocketFlow
 * @param repoUrl The URL of the repository to generate documentation for
 * @returns DocumentationResult with success status and Merkle tree data
 */
export async function generateDocumentation(repoUrl: string): Promise<DocumentationResult> {
  // Validate input
  if (!repoUrl) {
    return {
      success: false,
      message: 'Repository URL is required',
      error: 'No repository URL provided',
      merkleRoot: '',
      fileHashes: []
    };
  }

  // Set up paths
  const repoName = repoUrl.split('/').pop()?.replace(/\.git$/, '') || 'documentation';
  const outputDir = path.join(process.cwd(), 'output');
  const repoOutputDir = path.join(outputDir, repoName);
  const pocketflowOutputDir = path.join(process.cwd(), 'PocketFlow-Tutorial-Codebase-Knowledge', 'output');
  
  try {
    // Update status to indicate generation has started
    setGenerationStatus(
      repoName,
      'generating',
      10,
      'Starting documentation generation...'
    );

    // Ensure the URL is in the correct format for PocketFlow
    let processedUrl = repoUrl;
    if (repoUrl.startsWith('git@')) {
      // Convert SSH URL to HTTPS
      processedUrl = repoUrl.replace(':', '/').replace('git@', 'https://');
    }
    if (processedUrl.endsWith('.git')) {
      processedUrl = processedUrl.slice(0, -4);
    }

    console.log(`Processing repository: ${processedUrl}`);

    // Prepare the output directories
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(pocketflowOutputDir, { recursive: true });

    // Update status
    setGenerationStatus(
      repoName,
      'generating',
      20,
      'Cloning repository...'
    );

    // Prepare the command with simple quoting (Windows-friendly). Avoid escaping quotes inside since our args don't contain quotes.
    const escapeArg = (arg: string) => `"${arg}"`;
    
    // Build the command with all necessary parameters
    // Add skip-code-docs flag to avoid potential issues with the new LangChain integration
    const command = [
      'python',
      'PocketFlow-Tutorial-Codebase-Knowledge/main.py',
      '--repo', escapeArg(processedUrl),
      '--include', escapeArg('*'),
      ...DEFAULT_EXCLUDE_PATTERNS.flatMap(p => ['--exclude', escapeArg(p)]),
      '--max-size', '50000',
      '--output', escapeArg(pocketflowOutputDir),
      '--skip-code-docs' // Skip the new code documentation to avoid potential issues
    ].join(' ');
    
    console.log('Starting PocketFlow process with command:', command);
    
    try {
      // Use a more robust execution method
      const result = await executeCommandWithTimeout(command, 1800000); // 30 minutes
      const { stdout, stderr } = result;
      
      console.log('PocketFlow process completed successfully');
      console.log('STDOUT:', stdout);
      
      if (stderr) {
        console.warn('PocketFlow warnings:', stderr);
      }
      
      // Verify the output directory was created
      const finalOutputDir = path.join(pocketflowOutputDir, repoName);
      try {
        await fs.access(finalOutputDir);
        console.log(`Verified output directory exists: ${finalOutputDir}`);
      } catch (error) {
        throw new Error(`PocketFlow output directory not found at ${finalOutputDir}`);
      }

      // Copy the generated files to the output directory
      await fs.cp(finalOutputDir, repoOutputDir, { recursive: true, force: true });
      
      // Generate Merkle tree for the documentation
      const merkleTree = await DocumentationMerkleTree.fromDirectory(repoOutputDir, DEFAULT_EXCLUDE_PATTERNS);
      const merkleRoot = merkleTree.getRootHash();
      const fileHashes = merkleTree.getFileHashes();
      
      // Store Merkle tree data
      await fs.writeFile(
        path.join(repoOutputDir, '.merkle.json'),
        JSON.stringify({ merkleRoot, fileHashes }, null, 2)
      );
      
      // Update status
      setGenerationStatus(
        repoName,
        'complete',
        100,
        'Documentation generated successfully!',
        merkleRoot,
        fileHashes
      );
      
      return { 
        success: true, 
        message: 'Documentation generated successfully',
        output: { repoUrl, outputDir: repoOutputDir },
        merkleRoot,
        fileHashes
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('PocketFlow execution error:', error);
      
      if (error && typeof error === 'object' && 'stderr' in error) {
        console.error('STDERR:', (error as any).stderr);
      }
      if (error && typeof error === 'object' && 'stdout' in error) {
        console.error('STDOUT:', (error as any).stdout);
      }
      
      throw error; // Re-throw to be caught by the outer catch
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error during documentation generation:', error);
    
    // Check if it's a timeout error
    if (errorMessage.includes('timeout') || errorMessage.includes('SIGTERM')) {
      console.error('Process was terminated due to timeout. Consider increasing timeout or optimizing the repository size.');
    }
    
    setGenerationStatus(
      repoName,
      'error',
      0,
      `Failed to generate documentation: ${errorMessage}`
    );
    
    return { 
      success: false, 
      message: 'Failed to generate documentation',
      error: errorMessage,
      merkleRoot: '',
      fileHashes: []
    };
  }
}

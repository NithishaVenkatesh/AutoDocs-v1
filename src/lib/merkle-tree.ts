import { createHash } from 'crypto';
import { MerkleTree } from 'merkletreejs';
import { promises as fs } from 'fs';
import path from 'path';

// Type for file hash entries
interface FileHash {
  path: string;
  hash: string;
}

export class DocumentationMerkleTree {
  private tree!: MerkleTree;
  private leaves: Buffer[] = [];
  private fileHashes: FileHash[] = [];

  private constructor() {}

  static async fromDirectory(dirPath: string, excludePatterns: string[] = []): Promise<DocumentationMerkleTree> {
    const instance = new DocumentationMerkleTree();
    await instance.buildTree(dirPath, excludePatterns);
    return instance;
  }

  private async buildTree(dirPath: string, excludePatterns: string[]) {
    const files = await this.collectFiles(dirPath, dirPath, excludePatterns);
    
    // Sort files for consistent ordering
    files.sort();
    
    // Create leaves
    this.leaves = await Promise.all(
      files.map(async (file) => {
        const content = await fs.readFile(file, 'utf-8');
        const hash = createHash('sha256').update(content).digest('hex');
        this.fileHashes.push({ 
          path: path.relative(dirPath, file).replace(/\\/g, '/'), 
          hash 
        });
        return Buffer.from(hash, 'hex');
      })
    );

    this.tree = new MerkleTree(this.leaves, (data: Buffer) => 
      createHash('sha256').update(data).digest()
    );
  }

  private async collectFiles(
    dir: string,
    baseDir: string,
    excludePatterns: string[]
  ): Promise<string[]> {
    try {
      const dirents = await fs.readdir(dir, { withFileTypes: true });
      const files: string[] = [];

      for (const dirent of dirents) {
        const fullPath = path.resolve(dir, dirent.name);
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

        // Skip excluded patterns
        if (excludePatterns.some(pattern => {
          const regex = new RegExp(
            pattern
              .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
              .replace(/\*\*/g, '.*')
              .replace(/\*/g, '[^/]*')
          );
          return regex.test(relativePath) || regex.test(dirent.name);
        })) {
          continue;
        }

        if (dirent.isDirectory()) {
          const nestedFiles = await this.collectFiles(fullPath, baseDir, excludePatterns);
          files.push(...nestedFiles);
        } else if (dirent.isFile()) {
          files.push(fullPath);
        }
      }

      return files;
    } catch (error) {
      console.error(`Error collecting files from ${dir}:`, error);
      return [];
    }
  }

  getRootHash(): string {
    const root = this.tree.getRoot();
    return root ? root.toString('hex') : '';
  }

  getProof(filePath: string): string[] | null {
    const index = this.fileHashes.findIndex(f => f.path === filePath);
    if (index === -1 || index >= this.leaves.length) return null;
    
    const proof = this.tree.getProof(this.leaves[index]);
    return proof.map((p: any) => p.data.toString('hex'));
  }

  getFileHashes(): FileHash[] {
    return [...this.fileHashes];
  }

  static verifyProof(proof: string[], root: string, leaf: string): boolean {
    const tree = new MerkleTree([], () => Buffer.alloc(0));
    return tree.verify(
      proof.map(p => Buffer.from(p, 'hex')), 
      Buffer.from(leaf, 'hex'), 
      Buffer.from(root, 'hex')
    );
  }
}

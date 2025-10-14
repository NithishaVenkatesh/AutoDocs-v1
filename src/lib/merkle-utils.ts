import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

interface FileHash {
  path: string;
  hash: string;
}

export class MerkleTree {
  private root: string = '';
  private leaves: string[] = [];
  private fileHashes: FileHash[] = [];

  constructor() {}

  static async fromDirectory(dirPath: string, excludePatterns: string[] = []): Promise<MerkleTree> {
    const tree = new MerkleTree();
    await tree.buildTree(dirPath, excludePatterns);
    return tree;
  }

  private async buildTree(dirPath: string, excludePatterns: string[]) {
    const files = await this.collectFiles(dirPath, dirPath, excludePatterns);
    files.sort();
    
    this.leaves = await Promise.all(
      files.map(async (file) => {
        const content = await fs.readFile(file, 'utf-8');
        const hash = this.hash(content);
        this.fileHashes.push({ 
          path: path.relative(dirPath, file).replace(/\\/g, '/'), 
          hash 
        });
        return hash;
      })
    );

    this.root = this.calculateRoot(this.leaves);
  }

  /**
   * Hashes the given data using SHA-256
   * @param data The data to hash
   * @returns The hexadecimal hash string
   */
  public hash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private calculateRoot(hashes: string[]): string {
    if (hashes.length === 0) return '';
    if (hashes.length === 1) return hashes[0];

    const newHashes: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = i + 1 < hashes.length ? hashes[i + 1] : left;
      newHashes.push(this.hash(left + right));
    }

    return this.calculateRoot(newHashes);
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

        if (this.shouldExclude(relativePath, excludePatterns)) {
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

  private shouldExclude(filePath: string, excludePatterns: string[]): boolean {
    return excludePatterns.some(pattern => {
      const regex = new RegExp(
        pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*')
      );
      return regex.test(filePath);
    });
  }

  getRootHash(): string {
    return this.root;
  }

  getFileHashes(): FileHash[] {
    return [...this.fileHashes];
  }

  verifyFile(filePath: string, content: string): boolean {
    const fileHash = this.hash(content);
    const fileEntry = this.fileHashes.find(f => f.path === filePath);
    return fileEntry?.hash === fileHash;
  }

  static verifyProof(hashes: string[], root: string, leaf: string): boolean {
    if (hashes.length === 0) return false;
    
    let computedHash = leaf;
    for (const hash of hashes) {
      computedHash = computedHash < hash 
        ? createHash('sha256').update(computedHash + hash).digest('hex')
        : createHash('sha256').update(hash + computedHash).digest('hex');
    }
    
    return computedHash === root;
  }
}

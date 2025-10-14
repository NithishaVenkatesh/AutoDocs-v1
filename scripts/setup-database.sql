-- AutoDocs Database Schema
-- Run this script in your Neon database console

-- Create repositories table
CREATE TABLE IF NOT EXISTS repositories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL UNIQUE,
  github_id BIGINT UNIQUE NOT NULL,
  merkle_root VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on github_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_repositories_github_id ON repositories(github_id);

-- Create repo_documentation table
CREATE TABLE IF NOT EXISTS repo_documentation (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  chunk_hashes TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(repo_id, file_path)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_repo_documentation_repo_id ON repo_documentation(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_documentation_file_path ON repo_documentation(file_path);

-- Create repo_contents table (for storing file contents)
CREATE TABLE IF NOT EXISTS repo_contents (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  sha VARCHAR(40) NOT NULL,
  size INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(repo_id, file_path)
);

-- Create index for repo_contents
CREATE INDEX IF NOT EXISTS idx_repo_contents_repo_id ON repo_contents(repo_id);

-- Display success message
SELECT 'Database schema created successfully!' AS status;

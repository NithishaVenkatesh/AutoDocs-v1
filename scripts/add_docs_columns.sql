-- Add documentation status columns to repositories table
ALTER TABLE repositories 
ADD COLUMN IF NOT EXISTS docs_status VARCHAR(20) DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS docs_progress INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS docs_message TEXT,
ADD COLUMN IF NOT EXISTS docs_updated_at TIMESTAMP DEFAULT NOW();

-- Create an index on docs_status for faster filtering
CREATE INDEX IF NOT EXISTS idx_repositories_docs_status ON repositories(docs_status);

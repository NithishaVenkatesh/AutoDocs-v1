'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FiGithub, FiExternalLink, FiFileText, FiRefreshCw } from 'react-icons/fi';
import { fetchWithRetry } from '@/lib/fetchWithRetry';

// Simple markdown to HTML converter (basic implementation)
const renderMarkdown = (markdown) => {
  if (!markdown) return '';

  return markdown
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    // Code blocks
    .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    // Line breaks
    .replace(/\n/gim, '<br>');
};

const RepoCard = ({
  name,
  fullName,
  description,
  language,
  updatedAt,
  onDelete,
  isDeleting,
  stars,
  forks,
  openIssues,
  topics = []
}) => {
  const [docStatus, setDocStatus] = useState({ status: 'loading' });
  const [storedDocuments, setStoredDocuments] = useState(new Map()); // Store documents locally
  const [hasCheckedDocuments, setHasCheckedDocuments] = useState(false);
  const [isPermanentlyComplete, setIsPermanentlyComplete] = useState(false);
  
  const checkDocumentationStatus = async (repoName) => {
    console.log(`[${new Date().toISOString()}] Checking documentation status for: ${repoName}`);

    try {
      // First, check if there are any documents in the database for this repository
      const docsResponse = await fetch(`/api/repos/${encodeURIComponent(repoName)}?file=check`);
      let hasDocuments = false;

      if (docsResponse.ok) {
        const docsData = await docsResponse.json();
        hasDocuments = docsData.hasDocuments || false;
        console.log(`[RepoCard] Repository ${repoName} has documents: ${hasDocuments}`);
      } else {
        console.log(`[RepoCard] Could not check documents for ${repoName}, assuming none exist`);
      }

      // If there are documents, return complete status immediately
      if (hasDocuments) {
        setIsPermanentlyComplete(true); // Mark as permanently complete
        return {
          status: 'complete',
          progress: 100,
          message: 'Documentation completed',
          lastUpdated: new Date().toISOString(),
          hasDocuments: true
        };
      }

      // If no documents, check the status endpoint for current status
      const { success, data, error } = await fetchWithRetry(
        `/api/repos/${encodeURIComponent(repoName)}/status`,
        { cache: 'no-store' }
      );

      if (!success) {
        console.error(`Failed to check status for ${repoName} after retries:`, error);
        return {
          status: 'not_started',
          progress: 0,
          message: 'Documentation generation not started',
          lastUpdated: new Date().toISOString(),
          hasDocuments: false
        };
      }

      // Handle different statuses when no documents exist
      if (data.status === 'not_found') {
        return {
          status: 'not_started',
          progress: 0,
          message: 'Documentation generation not started',
          lastUpdated: new Date().toISOString(),
          hasDocuments: false
        };
      }

      if (data.status === 'error') {
        return {
          status: 'error',
          progress: 0,
          message: data.message || 'Error checking status',
          lastUpdated: data.lastUpdated || new Date().toISOString(),
          hasDocuments: false
        };
      }

      // Return the actual status from the database
      return {
        status: data.status || 'not_started',
        progress: data.progress || 0,
        message: data.message || '',
        lastUpdated: data.lastUpdated || new Date().toISOString(),
        hasDocuments: false
      };

    } catch (error) {
      console.error(`Unexpected error checking status for ${repoName}:`, error);
      return {
        status: 'error',
        progress: 0,
        message: 'Unexpected error checking status',
        lastUpdated: new Date().toISOString(),
        hasDocuments: false
      };
    }
  };

  // Function to get stored documents for display
  const getStoredDocuments = () => {
    const documents = [];
    for (const [filePath, docData] of storedDocuments) {
      documents.push({
        filePath,
        content: docData.content,
        timestamp: docData.timestamp
      });
    }
    return documents.sort((a, b) => a.filePath.localeCompare(b.filePath));
  };

  console.log(`[RepoCard] Rendering component for repo: ${name}`);

  useEffect(() => {
    console.log(`[RepoCard] useEffect running for repo: ${name}`);
    console.log(`[RepoCard] isPermanentlyComplete: ${isPermanentlyComplete}`);
    console.log(`[RepoCard] Stored documents count: ${storedDocuments.size}`);

    // If already permanently complete, don't check status again
    if (isPermanentlyComplete) {
      console.log(`[RepoCard] Repo ${name} is permanently complete, skipping status checks`);
      return;
    }

    const fetchStatus = async () => {
      const status = await checkDocumentationStatus(name);
      setDocStatus(status);

      // If we got a complete status with documents, mark as permanently complete
      if (status.status === 'complete' && status.hasDocuments) {
        setIsPermanentlyComplete(true);
        console.log(`[RepoCard] Marking ${name} as permanently complete`);
      }
    };

    // Initial status check
    fetchStatus();

    // Set up SSE connection for real-time updates
    console.log(`[SSE Frontend] Creating EventSource for repo: ${name}`);
    const eventSource = new EventSource('/api/sse');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`[SSE Frontend] Received update for ${name}:`, data);

        // Check if this update is for our repository
        if (data.repoName === name) {
          console.log(`[SSE Frontend] Update matches our repo ${name}:`, data);

          if (data.type === 'documentation_stored') {
            // Store the individual document content
            setStoredDocuments(prev => {
              const newMap = new Map(prev);
              newMap.set(data.filePath, {
                content: data.content,
                timestamp: data.timestamp
              });
              return newMap;
            });

            // Update progress for individual document storage
            setDocStatus(prevStatus => ({
              ...prevStatus,
              status: 'generating',
              progress: Math.round((data.processedFiles / data.totalFiles) * 100),
              message: data.message || `Processing ${data.filePath}`,
              lastUpdated: data.timestamp
            }));
          }

          if (data.type === 'documentation_error') {
            setDocStatus(prevStatus => ({
              ...prevStatus,
              status: 'error',
              message: data.message || 'Documentation generation failed',
              lastUpdated: data.timestamp
            }));
          }

          if (data.type === 'documentation_complete') {
            // Store all documents received in completion update
            if (data.documents && Array.isArray(data.documents)) {
              setStoredDocuments(prev => {
                const newMap = new Map(prev);
                data.documents.forEach(doc => {
                  newMap.set(doc.filePath, {
                    content: doc.content,
                    timestamp: data.timestamp
                  });
                });
                return newMap;
              });
            }

            // Mark as permanently complete when documentation is done
            setIsPermanentlyComplete(true);
            setDocStatus(prevStatus => ({
              ...prevStatus,
              status: 'complete',
              progress: 100,
              message: 'Documentation completed',
              lastUpdated: data.timestamp,
              hasDocuments: true
            }));
          }
        }
      } catch (error) {
        console.error('[SSE Frontend] Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[SSE Frontend] SSE connection error for', name, ':', error);
    };

    // Only poll when actively generating (not permanently complete)
    const interval = setInterval(() => {
      if (docStatus.status === 'generating' && !isPermanentlyComplete) {
        fetchStatus();
      }
    }, 2000); // Poll every 2 seconds when generating

    return () => {
      clearInterval(interval);
      eventSource.close();
    };
  }, [name, isPermanentlyComplete]); // Add isPermanentlyComplete to dependencies
  
  // Manual refresh function
  const refreshStatus = async () => {
    const status = await checkDocumentationStatus(name);
    setDocStatus(status);
  };
  
  const getStatusBadge = () => {
    switch(docStatus.status) {
      case 'complete':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Ready
          </span>
        );
      case 'generating':
        return (
          <div className="flex flex-col space-y-1">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 w-fit mb-1">
              In Progress
            </span>
            <div className="flex items-center space-x-2">
              <div className="w-16 bg-gray-200 rounded-full h-1.5">
                <div 
                  className="bg-blue-600 h-1.5 rounded-full" 
                  style={{ width: `${docStatus.progress || 0}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">{docStatus.progress || 0}%</span>
            </div>
          </div>
        );
      case 'error':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            Error
          </span>
        );
      case 'not_started':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Not Generated
          </span>
        );
      case 'loading':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Checking...
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Unknown
          </span>
        );
    }
  };

  return (
    <div className="group w-[415px] bg-gradient-to-br from-gray-900 to-gray-950 rounded-xl border border-gray-800 hover:border-gray-700 p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5 hover:-translate-y-1">
      <div>
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h3 className="font-semibold text-white text-xl mb-2 group-hover:text-blue-400 transition-colors">
              {name}
            </h3>
            <p className="text-sm text-gray-400 flex items-center">
              <FiGithub className="mr-2" size={14} />
              {fullName ? fullName.split('/')[0] : 'Unknown'}
            </p>
          </div>
          <div className="flex space-x-2">
            <a
              href={`https://github.com/${fullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-all"
              title="View on GitHub"
            >
              <FiExternalLink size={18} />
            </a>
          </div>
        </div>
        
        <div className="space-y-4">
          {description && (
            <p className="text-sm text-gray-400 line-clamp-2 leading-relaxed">
              {description}
            </p>
          )}
          
          {/* Language and Stats */}
          {language && (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-blue-500 mr-1.5"></span>
                {language}
              </span>
              {stars > 0 && (
                <span className="flex items-center">
                  {stars}
                </span>
              )}
            </div>
          )}
          
          {/* Documentation Status Section */}
          <div className="pt-4 border-t border-gray-800">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1">
                {getStatusBadge()}
                <button
                  onClick={refreshStatus}
                  className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors"
                  title="Refresh status"
                >
                  <FiRefreshCw size={14} />
                </button>
              </div>
              {docStatus.status === 'complete' && (
                <Link 
                  href={`/docs/${name}`}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-sm font-medium rounded-lg text-white transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40"
                >
                  <FiFileText className="mr-2" size={14} /> 
                  View Docs
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Progress Bar for Generating Status */}
      {docStatus.status === 'generating' && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Generating documentation...</span>
            <span className="text-xs font-medium text-blue-400">{docStatus.progress || 0}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-blue-600 to-blue-400 h-2 rounded-full transition-all duration-500 ease-out relative"
              style={{ width: `${docStatus.progress || 0}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RepoCard;
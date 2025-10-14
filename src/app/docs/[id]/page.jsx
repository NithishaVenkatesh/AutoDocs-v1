'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FiArrowLeft, FiLoader, FiAlertCircle, FiBook, FiSearch, FiMenu, FiX, FiFileText, FiChevronRight, FiRefreshCw } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import 'highlight.js/styles/github-dark.css';
import React from 'react';

export default function DocumentationPage({ params }) {
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [docState, setDocState] = useState({
    status: 'loading',
    content: '',
    files: [],
    error: null,
    selectedFile: null
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tocItems, setTocItems] = useState([]);

  // Function to get stored documents from sessionStorage
  const getStoredDocuments = () => {
    try {
      const stored = sessionStorage.getItem(`docs_${id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log(`[DOCS] Found ${Object.keys(parsed).length} stored documents for ${id}`);
        return parsed;
      }
    } catch (error) {
      console.error('[DOCS] Error reading stored documents:', error);
    }
    return null;
  };

  // Function to store documents in sessionStorage
  const storeDocuments = (documents) => {
    try {
      const docsObj = {};
      documents.forEach(doc => {
        docsObj[doc.filePath] = {
          content: doc.content,
          timestamp: doc.timestamp || new Date().toISOString()
        };
      });
      sessionStorage.setItem(`docs_${id}`, JSON.stringify(docsObj));
      console.log(`[DOCS] Stored ${documents.length} documents for ${id}`);
    } catch (error) {
      console.error('[DOCS] Error storing documents:', error);
    }
  };

  // Function to fetch documentation (defined outside useEffect)
  const fetchDocumentation = async () => {
    try {
      setIsRefreshing(true);

      // Always fetch fresh data from API to get complete file list
      const timestamp = Date.now(); // Add timestamp to prevent caching
      const response = await fetch(`/api/repos/${id}?t=${timestamp}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to load documentation');
      }

      if (data.status === 'complete') {
        // Load all documents content for better UX
        console.log(`[DOCS] Loading all ${data.files.length} documents for ${id}`);

        // Fetch content for all files
        const allDocuments = [];
        for (const file of data.files) {
          try {
            const fileResponse = await fetch(`/api/repos/${id}?file=${encodeURIComponent(file.name)}`);
            if (fileResponse.ok) {
              const fileData = await fileResponse.json();
              allDocuments.push({
                filePath: file.name,
                content: fileData.content,
                timestamp: new Date().toISOString()
              });
            }
          } catch (error) {
            console.error(`[DOCS] Failed to load file ${file.name}:`, error);
          }
        }

        // Store all documents for future use
        if (allDocuments.length > 0) {
          storeDocuments(allDocuments);
        }

        setDocState({
          status: 'complete',
          content: allDocuments[0]?.content || '',
          files: data.files,
          selectedFile: allDocuments[0]?.filePath || null,
          error: null,
          fromCache: false
        });
      } else {
        setDocState({
          status: 'error',
          content: '',
          files: [],
          selectedFile: null,
          error: data.message || 'Documentation not found'
        });
      }
    } catch (error) {
      console.error('Error loading documentation:', error);
      setDocState({
        status: 'error',
        content: '',
        files: [],
        selectedFile: null,
        error: error.message || 'Failed to load documentation'
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchDocumentation();

    // Set up SSE connection for real-time updates
    const eventSource = new EventSource('/api/sse');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Check if this update is for our repository
        if (data.repoName === id && (data.type === 'documentation_complete' || data.type === 'documentation_error' || data.type === 'documentation_stored')) {
          console.log(`[DOCS] Received SSE update for ${id}:`, data);

          if (data.type === 'documentation_complete' && data.documents && Array.isArray(data.documents)) {
            // Store all received documents
            console.log(`[DOCS] Storing ${data.documents.length} documents from SSE`);
            storeDocuments(data.documents);

            // Update file list and content
            const firstDoc = data.documents[0];
            setDocState(prev => ({
              status: 'complete',
              content: firstDoc.content,
              files: data.documents.map(doc => ({ name: doc.filePath, path: doc.filePath })),
              selectedFile: firstDoc.filePath,
              error: null
            }));
            setIsRefreshing(false);
          } else if (data.type === 'documentation_stored' && data.content) {
            // Store individual document as it arrives
            console.log(`[DOCS] Storing individual document from SSE: ${data.filePath}`);
            storeDocuments([{
              filePath: data.filePath,
              content: data.content,
              timestamp: data.timestamp
            }]);

            // Add to file list if not already present and update state
            setDocState(prev => {
              const fileExists = prev.files.some(file => file.name === data.filePath);
              if (!fileExists) {
                const newFiles = [...prev.files, { name: data.filePath, path: data.filePath }];
                console.log(`[DOCS] Added new file to list: ${data.filePath}`);

                // Auto-select the first document when it arrives
                if (prev.files.length === 0 && newFiles.length === 1) {
                  console.log(`[DOCS] Auto-selecting first document: ${data.filePath}`);
                  return {
                    ...prev,
                    files: newFiles,
                    selectedFile: data.filePath,
                    content: data.content,
                    status: 'generating'
                  };
                }

                return {
                  ...prev,
                  files: newFiles,
                  status: 'generating'
                };
              }
              return prev;
            });

            // Update progress if provided
            if (data.processedFiles && data.totalFiles) {
              setDocState(prev => ({
                ...prev,
                status: 'generating',
                progress: Math.round((data.processedFiles / data.totalFiles) * 100)
              }));
            }
          } else {
            // Fall back to API call if no documentation data in SSE
            console.log(`[DOCS] No documentation data in SSE, fetching from API`);
            fetchDocumentation();
          }
        }
      } catch (error) {
        console.error('[DOCS] Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[DOCS] SSE connection error:', error);
    };

    return () => {
      eventSource.close();
    };
  }, [id]);

  // Extract table of contents from markdown
  useEffect(() => {
    if (docState.content) {
      const headings = [];
      const lines = docState.content.split('\n');
      lines.forEach((line, index) => {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          const level = match[1].length;
          const text = match[2];
          const slug = text.toLowerCase().replace(/[^\w]+/g, '-');
          headings.push({ level, text, slug, line: index });
        }
      });
      setTocItems(headings);
    }
  }, [docState.content]);

  const handleFileSelect = async (filename) => {
    try {
      // Set loading state for file switch
      setDocState(prev => ({
        ...prev,
        status: 'loading',
        selectedFile: filename
      }));

      // First, check if we have this file stored locally
      const storedDocs = getStoredDocuments();
      if (storedDocs && storedDocs[filename]) {
        console.log(`[DOCS] Using stored document for ${filename}`);
        setDocState({
          status: 'complete',
          content: storedDocs[filename].content,
          selectedFile: filename,
          files: docState.files, // Keep existing files list
          error: null,
          fromCache: true
        });
        setSearchQuery('');
        return;
      }

      // If not stored locally, fetch from API
      const response = await fetch(`/api/repos/${id}?file=${encodeURIComponent(filename)}&t=${Date.now()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to load file');
      }

      // Store the fetched file for future use
      storeDocuments([{
        filePath: filename,
        content: data.content,
        timestamp: new Date().toISOString()
      }]);

      setDocState({
        status: 'complete',
        content: data.content,
        selectedFile: filename,
        files: docState.files, // Keep existing files list
        error: null,
        fromCache: false
      });
    } catch (error) {
      console.error('Error loading file:', error);
      setDocState({
        status: 'error',
        content: '',
        files: docState.files,
        selectedFile: null,
        error: error.message || 'Failed to load file content'
      });
    }
  };

  const scrollToHeading = (slug) => {
    const element = document.getElementById(slug);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return docState.files;
    return docState.files.filter(file =>
      file.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [docState.files, searchQuery]);

  if (docState.status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => router.back()}
            className="flex items-center text-gray-400 hover:text-white mb-8 transition-colors group"
          >
            <FiArrowLeft className="mr-2 group-hover:-translate-x-1 transition-transform" /> 
            Back to Dashboard
          </button>
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <FiLoader className="animate-spin h-12 w-12 text-blue-500 mb-4" />
              <div className="absolute inset-0 blur-xl bg-blue-500/20 animate-pulse"></div>
            </div>
            <p className="text-gray-400 text-lg mt-4">Loading documentation...</p>
          </div>
        </div>
      </div>
    );
  }

  if (docState.status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => router.back()}
            className="flex items-center text-gray-400 hover:text-white mb-8 transition-colors group"
          >
            <FiArrowLeft className="mr-2 group-hover:-translate-x-1 transition-transform" /> 
            Back to Dashboard
          </button>
          <div className="bg-red-950/50 border border-red-900/50 backdrop-blur-sm p-6 rounded-xl">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <FiAlertCircle className="h-6 w-6 text-red-400" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-red-300 mb-2">Error Loading Documentation</h3>
                <p className="text-sm text-red-200">
                  {docState.error || 'Failed to load documentation'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="flex items-center text-gray-400 hover:text-white transition-colors group"
              >
                <FiArrowLeft className="mr-2 group-hover:-translate-x-1 transition-transform" /> 
                <span className="hidden sm:inline">Back</span>
              </button>
              <div className="h-6 w-px bg-gray-800"></div>
              <div className="flex items-center space-x-3">
                <FiBook className="text-blue-500 h-6 w-6" />
                <h1 className="text-xl sm:text-2xl font-bold text-white truncate max-w-xs sm:max-w-md">
                  {id}
                </h1>
                {isRefreshing && (
                  <div className="flex items-center text-blue-400 text-sm">
                    <FiLoader className="animate-spin mr-2" size={14} />
                    Updating...
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={fetchDocumentation}
                disabled={isRefreshing}
                className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                title="Refresh documentation"
              >
                <FiRefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 text-gray-400 hover:text-white transition-colors"
              >
                {sidebarOpen ? <FiX size={24} /> : <FiMenu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1920px] mx-auto px-4 sm:px-8 py-8">
        <div className="flex gap-6 relative">
          {/* Sidebar */}
          <aside
            className={`${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            } lg:translate-x-0 fixed lg:sticky top-20 left-0 h-[calc(100vh-5rem)] w-80 flex-shrink-0 transition-transform duration-300 ease-in-out z-40 lg:z-0`}
          >
            <div className="h-full bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-xl p-4 overflow-hidden flex flex-col">
              {/* Search */}
              <div className="mb-4">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <h2 className="text-sm font-semibold mb-3 text-gray-400 uppercase tracking-wider flex items-center">
                  <FiFileText className="mr-2" size={14} />
                  Documentation Files
                </h2>
                <ul className="space-y-1">
                  {filteredFiles.map((file, index) => (
                    <li key={index}>
                      <button
                        onClick={() => handleFileSelect(file.name)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 flex items-center justify-between group ${
                          docState.selectedFile === file.name
                            ? 'bg-blue-600/20 text-blue-300 font-medium border border-blue-600/50 shadow-lg shadow-blue-500/10'
                            : 'text-gray-300 hover:bg-gray-800/50 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{file.name}</span>
                        {docState.selectedFile === file.name && (
                          <FiChevronRight className="flex-shrink-0 ml-2" size={16} />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {filteredFiles.length === 0 && (
                  <p className="text-gray-500 text-sm text-center py-8">No files found</p>
                )}
              </div>

              {/* Table of Contents */}
              {tocItems.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <h2 className="text-sm font-semibold mb-3 text-gray-400 uppercase tracking-wider">
                    On This Page
                  </h2>
                  <ul className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                    {tocItems.slice(0, 10).map((item, index) => (
                      <li key={index}>
                        <button
                          onClick={() => scrollToHeading(item.slug)}
                          className={`w-full text-left px-2 py-1 text-xs text-gray-400 hover:text-blue-400 transition-colors ${
                            item.level > 1 ? `pl-${(item.level - 1) * 3}` : ''
                          }`}
                          style={{ paddingLeft: `${(item.level - 1) * 0.75}rem` }}
                        >
                          {item.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>

          {/* Overlay for mobile */}
          {sidebarOpen && (
            <div
              className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-30"
              onClick={() => setSidebarOpen(false)}
            ></div>
          )}

          {/* Documentation Content */}
          <main className="flex-1 min-w-0">
            <div className="bg-gray-900/30 backdrop-blur-sm border border-gray-800/50 rounded-xl overflow-hidden">
              <div className="p-6 sm:p-8 lg:p-12">
                {docState.status === 'loading' && docState.selectedFile ? (
                  // Loading state when switching files
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="relative">
                      <FiLoader className="animate-spin h-8 w-8 text-blue-500 mb-4" />
                      <div className="absolute inset-0 blur-xl bg-blue-500/20 animate-pulse"></div>
                    </div>
                    <p className="text-gray-400 text-sm mt-4">Loading {docState.selectedFile}...</p>
                  </div>
                ) : (
                  <div className="prose prose-invert prose-lg max-w-none
                    prose-headings:font-bold prose-headings:tracking-tight
                    prose-h1:text-4xl prose-h1:mb-8 prose-h1:pb-4 prose-h1:border-b prose-h1:border-gray-800
                    prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-6
                    prose-h3:text-2xl prose-h3:mt-8 prose-h3:mb-4
                    prose-p:text-gray-300 prose-p:leading-relaxed
                    prose-a:text-blue-400 prose-a:no-underline hover:prose-a:text-blue-300 hover:prose-a:underline
                    prose-code:text-pink-400 prose-code:bg-gray-800/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                    prose-pre:bg-gray-950/50 prose-pre:border prose-pre:border-gray-800 prose-pre:shadow-xl
                    prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-950/20 prose-blockquote:py-1
                    prose-ul:text-gray-300 prose-ol:text-gray-300
                    prose-li:marker:text-blue-500
                    prose-strong:text-white prose-strong:font-semibold
                    prose-img:rounded-lg prose-img:shadow-2xl
                    prose-hr:border-gray-800
                    prose-table:border prose-table:border-gray-800
                    prose-th:bg-gray-800/50 prose-th:text-white
                    prose-td:border-gray-800">
                    <ReactMarkdown
                      rehypePlugins={[rehypeHighlight, rehypeSlug]}
                      remarkPlugins={[remarkGfm]}
                    >
                      {docState.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

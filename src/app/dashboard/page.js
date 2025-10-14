"use client";

import { useEffect, useRef, useState } from "react";
import { FiAlertCircle, FiCheckCircle } from "react-icons/fi";
import RepoCard from "@/components/RepoCard";

export default function DashboardPage() {
  const [repos, setRepos] = useState([]);
  const [savedRepos, setSavedRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [pendingRepo, setPendingRepo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [deletingRepoId, setDeletingRepoId] = useState(null);

  // Fetch available GitHub repositories
  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const res = await fetch("/api/github");
        const data = await res.json();
        if (data.repos) {
          setRepos(data.repos);
        }
      } catch (error) {
        console.error("Error fetching GitHub repos:", error);
        setError("Failed to load GitHub repositories");
      }
    };

    fetchRepos();
  }, []);

  // Fetch saved repositories with status information
  const fetchSavedRepos = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch("/api/repos");

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch repositories');
      }

      const data = await res.json();

      // Update repositories state
      setSavedRepos(data.repos || []);

      return data.repos || [];
    } catch (error) {
      console.error("Error fetching repositories:", error);
      setError(error.message || 'Failed to load repositories');
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch of saved repos
  useEffect(() => {
    fetchSavedRepos();

    // Set up SSE connection for real-time updates
    const eventSource = new EventSource('/api/sse');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        console.log('Received SSE update in dashboard:', data);

        if (data.type === 'documentation_complete' || data.type === 'documentation_error') {
          // Refresh the repository list when documentation completes for any repo
          fetchSavedRepos();
        }
      } catch (error) {
        console.error('Error parsing SSE data in dashboard:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error in dashboard:', error);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Function to handle repo selection from dropdown
  const handleRepoSelect = (e) => {
    const repoId = e.target.value;
    if (!repoId) return; // Don't proceed if no repo is selected
    
    const repo = repos.find((r) => r.id === parseInt(repoId));
    if (repo) {
      setPendingRepo(repo);
      setShowConfirmDialog(true);
    }
  };

  // Function to handle repository deletion
  const deleteRepo = async (repoId) => {
    if (!window.confirm('Are you sure you want to remove this repository? This will also remove its documentation.')) {
      return;
    }
    
    try {
      setDeletingRepoId(repoId);
      setError(null);
      
      const res = await fetch(`/api/repos/${repoId}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete repository');
      }
      
      // Update UI optimistically
      setSavedRepos(prev => {
        const updatedRepos = prev.filter(repo => repo.id !== repoId);
        return updatedRepos;
      });
      
      setSuccess('Repository removed successfully');
      
      // Clear success message after 5 seconds
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
      
    } catch (error) {
      console.error('Error deleting repository:', error);
      setError(error.message || 'Failed to delete repository');
    } finally {
      setDeletingRepoId(null);
    }
  };

  // Function to confirm and save the selected repo
  const confirmSaveRepo = async () => {
    if (!pendingRepo) return;
    
    try {
      setError(null);
      setIsLoading(true);
      
      const res = await fetch("/api/repos/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: pendingRepo }),
      });

      const data = await res.json();
      
      // Handle different response statuses
      if (!res.ok && res.status !== 207) {
        const errorMessage = data?.error || data?.message || 'Failed to save repository';
        throw new Error(errorMessage);
      }

      // Handle the repository data
      setSavedRepos(prev => {
        // Check if repository already exists to prevent duplicates
        const exists = prev.some(repo => 
          repo.id === data.repo.id || 
          repo.github_repo_id === data.repo.github_repo_id ||
          repo.full_name === data.repo.full_name
        );
        
        if (exists) {
          // Update existing repo
          return prev.map(repo => 
            repo.id === data.repo.id || 
            repo.github_repo_id === data.repo.github_repo_id ||
            repo.full_name === data.repo.full_name
              ? { ...repo, ...data.repo } // Merge with updated data
              : repo
          );
        }
        
        // Add new repo
        return [...prev, data.repo];
      });
      
      // Show appropriate success/warning message
      const successMessage = data.message || 
        (res.status === 207 
          ? (data.warning || 'Repository saved with some issues') 
          : 'Repository added successfully!');
      
      setSuccess(successMessage);
      setShowConfirmDialog(false);
      setPendingRepo(null);
      
      // Refresh the repository list
      fetchSavedRepos();
      
      // Clear success message after 5 seconds
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
      
    } catch (error) {
      console.error('Error saving repository:', error);
      setError(error.message || 'Failed to save repository');
    } finally {
      setIsLoading(false);
    }
  };

  const containerRef = useRef(null);
  const projectsRef = useRef(null);

  // Add subtle landing animation when projects (part 2) snaps into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timeout;
    const onScroll = () => {
      // Debounce scroll end
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const width = el.clientWidth;
        // If most of the viewport is showing projects (part 2), trigger bounce
        if (projectsRef.current) {
          const rect = projectsRef.current.getBoundingClientRect();
          const inView = rect.left < width * 0.2; // mostly in view
          if (inView) {
            projectsRef.current.classList.remove('landing-bounce');
            // Force reflow to restart animation
            projectsRef.current.offsetHeight;
            projectsRef.current.classList.add('landing-bounce');
          }
        }
      }, 120);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(timeout);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black overflow-hidden">
      {/* Repo Picker Modal */}
      {showRepoPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowRepoPicker(false)} />
          <div className="relative bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg mx-4 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-4">Create Project</h3>
            <p className="text-gray-400 text-sm mb-4">Select a GitHub repository to add.</p>
            <div className="relative">
              <select
                onChange={(e) => { handleRepoSelect(e); setShowRepoPicker(false); }}
                className="appearance-none w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 pr-10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
                disabled={isLoading}
                defaultValue=""
              >
                <option value="" disabled>Select a repository</option>
                {repos.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.full_name || repo.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                type="button"
                className="px-4 py-2 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 hover:bg-gray-800 transition-colors"
                onClick={() => setShowRepoPicker(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Confirmation Dialog */}
      {showConfirmDialog && pendingRepo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full border border-gray-800">
            <h3 className="text-lg font-medium text-white mb-4">Add Repository</h3>
            <p className="text-gray-300 text-sm mb-6">
              Are you sure you want to add <span className="font-medium text-white">{pendingRepo.full_name || pendingRepo.name}</span> to your dashboard?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                className="px-4 py-2 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 hover:bg-gray-800 transition-colors"
                onClick={() => {
                  setShowConfirmDialog(false);
                  setPendingRepo(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                onClick={confirmSaveRepo}
              >
                Add Repository
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={containerRef} className="h-full overflow-x-auto scroll-smooth snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="flex h-full min-w-max gap-[645px]">
          {/* Left Sidebar - Scrolls with content */}
          <div className="w-96 flex-shrink-0 p-8 h-full flex flex-col justify-center items-start snap-start">
            <div>
              <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-3">AutoDocs</h1>
              <p className="text-gray-300 text-base md:text-lg font-medium leading-relaxed mb-10">
                Because developers love shipping, not writing.
              </p>
              
              <div className="relative w-full mb-8">
                <button
                  type="button"
                  onClick={() => setShowRepoPicker(true)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 text-sm hover:bg-gray-800 transition-colors text-left"
                  disabled={isLoading}
                >
                  + Create Project
                </button>
              </div>

              {error && (
                <div className="bg-red-900/30 border-l-4 border-red-500 p-4 mb-6 rounded-r">
                  <div className="flex items-center">
                    <FiAlertCircle className="h-5 w-5 text-red-400 mr-3" />
                    <p className="text-sm text-red-200">{error}</p>
                  </div>
                </div>
              )}

              {success && (
                <div className="bg-green-900/30 border-l-4 border-green-500 p-4 rounded-r">
                  <div className="flex items-center">
                    <FiCheckCircle className="h-5 w-5 text-green-400 mr-3" />
                    <p className="text-sm text-green-200">{success}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Projects Container */}
          <div ref={projectsRef} className="flex-1 p-8 h-full flex flex-col overflow-hidden snap-start">
            <div className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-xl p-6 border border-gray-800 h-full flex flex-col shadow-2xl">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">Your Projects</h2>
                <p className="text-gray-400 text-sm">
                  {savedRepos.length > 0 
                    ? `${savedRepos.length} ${savedRepos.length === 1 ? 'repository' : 'repositories'} with documentation`
                    : 'Get started by adding your first repository'}
                </p>
              </div>
              
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="relative">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                    <div className="absolute inset-0 blur-xl bg-blue-500/20 animate-pulse"></div>
                  </div>
                </div>
              ) : savedRepos.length > 0 ? (
                <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4 custom-scrollbar">
                  <div className="flex space-x-5 h-full items-start">
                    {/* Chunk repositories into groups of 3 */}
                    {(() => {
                      const chunkedRepos = [];
                      for (let i = 0; i < savedRepos.length; i += 3) {
                        chunkedRepos.push(savedRepos.slice(i, i + 3));
                      }
                      return chunkedRepos.map((column, colIndex) => (
                        <div key={`col-${colIndex}`} className="flex flex-col space-y-5 w-[415px] flex-shrink-0">
                          {column.map((repo, repoIndex) => (
                            <RepoCard 
                              key={`${repo.id}-${repo.full_name || repo.name}-${repoIndex}`}
                              name={repo.name}
                              fullName={repo.full_name}
                              description={repo.description}
                              language={repo.language}
                              updatedAt={repo.updated_at}
                              onDelete={() => handleDeleteRepo(repo.id)}
                              isDeleting={deletingRepoId === repo.id}
                              stars={repo.stargazers_count}
                              forks={repo.forks_count}
                              openIssues={repo.open_issues_count}
                              topics={repo.topics}
                            />
                          ))}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-950/50 rounded-lg border-2 border-dashed border-gray-800">
                  <svg className="w-16 h-16 text-gray-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-lg font-medium mb-2">No projects yet</p>
                  <p className="text-sm text-gray-500 mb-6">Add a repository to generate documentation</p>
                  <button
                    onClick={() => setShowRepoPicker(true)}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20"
                  >
                    Add Your First Project
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

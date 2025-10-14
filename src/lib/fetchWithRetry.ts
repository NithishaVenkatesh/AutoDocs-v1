export const fetchWithRetry = async (url: string, options: RequestInit = {}, maxRetries = 3) => {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        // Check content type before parsing JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          return { success: true, data };
        } else {
          // If not JSON, try to get text for debugging
          const text = await response.text();
          console.error(`Expected JSON but got ${contentType}. Response:`, text.substring(0, 200));
          throw new Error(`Expected JSON response but got ${contentType}`);
        }
      }
      // Fix: Add fallback for statusText which might be undefined
      const statusText = response.statusText || 'Unknown Error';
      lastError = new Error(`HTTP ${response.status}: ${statusText}`);
    } catch (error) {
      // If it's a JSON parsing error and the response looks like HTML, provide better error message
      if (error instanceof SyntaxError && error.message.includes('Unexpected token')) {
        lastError = new Error(`Server returned HTML instead of JSON. This might indicate a server error or incorrect API endpoint. URL: ${url}`);
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    // Exponential backoff
    if (i < maxRetries - 1) {
      const delay = 1000 * Math.pow(2, i);
      console.log(`Retry ${i + 1} in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { success: false, error: lastError };
};

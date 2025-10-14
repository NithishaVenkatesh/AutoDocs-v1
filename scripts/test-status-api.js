// Test the status API endpoint
async function testStatusAPI() {
  const repoName = 'Library-Management-System';
  const url = `http://localhost:3000/api/repos/${repoName}/status`;
  
  console.log(`Testing status API: ${url}\n`);
  
  try {
    const response = await fetch(url);
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);
    
    const text = await response.text();
    console.log(`\nResponse body (first 500 chars):`);
    console.log(text.substring(0, 500));
    
    // Try to parse as JSON
    try {
      const json = JSON.parse(text);
      console.log(`\n✅ Valid JSON response:`);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log(`\n❌ Not valid JSON`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testStatusAPI();

const { Client } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

(async () => {
  const db = new Client(process.env.DATABASE_URL);
  await db.connect();
  
  console.log('📋 Checking repo_documentation columns...');
  const result = await db.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'repo_documentation'
    ORDER BY ordinal_position
  `);
  
  console.log('\n✅ Existing columns:');
  result.rows.forEach(row => {
    console.log(`   - ${row.column_name} (${row.data_type})`);
  });
  
  await db.end();
})();

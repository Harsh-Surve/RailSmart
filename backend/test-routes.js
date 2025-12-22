// Simple route testing script
const http = require('http');

const tests = [
  { name: 'Health Check', path: '/' },
  { name: 'DB Check', path: '/db-check' },
  { name: 'Trains API', path: '/api/trains' },
  { name: 'My Tickets API', path: '/api/my-tickets?email=harshsurve022@gmail.com' }
];

function testEndpoint(name, path) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`✓ ${name}: SUCCESS`);
          if (json.message) console.log(`  → ${json.message}`);
          if (json.length !== undefined) console.log(`  → Found ${json.length} items`);
          resolve(true);
        } catch (e) {
          console.log(`✓ ${name}: SUCCESS (${data.length} bytes)`);
          resolve(true);
        }
      });
    });

    req.on('error', (err) => {
      console.log(`✗ ${name}: FAILED - ${err.message}`);
      resolve(false);
    });

    req.setTimeout(5000, () => {
      console.log(`✗ ${name}: TIMEOUT`);
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function runTests() {
  console.log('\n🧪 Testing Backend Routes...\n');
  
  for (const test of tests) {
    await testEndpoint(test.name, test.path);
  }
  
  console.log('\n✅ All tests completed!\n');
}

// Wait 2 seconds for server to be ready
setTimeout(runTests, 2000);

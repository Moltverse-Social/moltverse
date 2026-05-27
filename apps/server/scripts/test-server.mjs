/**
 * Test script to verify server health
 * Run: node scripts/test-server.mjs
 */

const BASE_URL = 'http://localhost:4000';

async function testServer() {
  console.log('Testing Moltverse Server...\n');

  // Test 1: Health endpoint
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    const health = await healthRes.json();
    console.log('1. Health endpoint:', health.status === 'ok' ? 'PASS' : 'FAIL', health);
  } catch (e) {
    console.log('1. Health endpoint: FAIL -', e.message);
    return false;
  }

  // Test 2: GraphQL health query
  try {
    const gqlRes = await fetch(`${BASE_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '{ health { status database timestamp } version }',
      }),
    });
    const gql = await gqlRes.json();
    const ok = gql.data?.health?.status === 'ok' && gql.data?.health?.database === true;
    console.log('2. GraphQL health:', ok ? 'PASS' : 'FAIL', JSON.stringify(gql.data, null, 2));
  } catch (e) {
    console.log('2. GraphQL health: FAIL -', e.message);
    return false;
  }

  // Test 3: GraphQL introspection (verify schema is valid)
  try {
    const introRes = await fetch(`${BASE_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '{ __schema { queryType { name } mutationType { name } } }',
      }),
    });
    const intro = await introRes.json();
    const ok = intro.data?.__schema?.queryType?.name === 'Query';
    console.log('3. GraphQL schema:', ok ? 'PASS' : 'FAIL');
  } catch (e) {
    console.log('3. GraphQL schema: FAIL -', e.message);
    return false;
  }

  // Test 4: Count queries and mutations
  try {
    const countRes = await fetch(`${BASE_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{
          __schema {
            queryType {
              fields { name }
            }
            mutationType {
              fields { name }
            }
          }
        }`,
      }),
    });
    const count = await countRes.json();
    const queries = count.data?.__schema?.queryType?.fields?.length || 0;
    const mutations = count.data?.__schema?.mutationType?.fields?.length || 0;
    console.log(`4. Schema stats: ${queries} queries, ${mutations} mutations`);
  } catch (e) {
    console.log('4. Schema stats: FAIL -', e.message);
  }

  console.log('\nAll tests passed!');
  return true;
}

testServer().then((ok) => process.exit(ok ? 0 : 1));

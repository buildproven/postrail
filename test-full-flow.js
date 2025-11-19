/**
 * End-to-End Flow Test
 *
 * This simulates the entire newsletter → post generation flow
 * and shows exactly where it breaks
 */

require('dotenv').config({ path: '.env.local' });

const TEST_URL = 'http://localhost:3002';
const TEST_NEWSLETTER = {
  title: 'How to Build Your First SaaS in 30 Days',
  content: `
    Building a SaaS product in 30 days is challenging but possible. Here's how:

    Week 1: Validate your idea
    - Talk to 10 potential customers
    - Build a landing page
    - Get 50 email signups

    Week 2: Build MVP
    - Focus on core feature only
    - Use proven tech stack
    - No perfect code, just working code

    Week 3: Get first users
    - Launch on Product Hunt
    - Share on LinkedIn
    - Email your list

    Week 4: Iterate
    - Talk to users daily
    - Fix critical bugs
    - Add one requested feature

    The key is to start small and move fast.
  `
};

async function testFullFlow() {
  console.log('🧪 Testing Full Newsletter → Post Generation Flow\n');
  console.log('─'.repeat(70));

  // Step 1: Check if server is running
  console.log('\n1️⃣  Checking if dev server is running...');
  try {
    await fetch(TEST_URL);
    console.log(`   ✅ Server is running on ${TEST_URL}`);
  } catch {
    console.log(`   ❌ Server is NOT running`);
    console.log(`   Run: npm run dev`);
    process.exit(1);
  }

  // Step 2: Test POST to /api/generate-posts
  console.log('\n2️⃣  Testing POST to /api/generate-posts...');
  console.log(`   Title: ${TEST_NEWSLETTER.title}`);
  console.log(`   Content length: ${TEST_NEWSLETTER.content.length} chars`);

  try {
    const response = await fetch(`${TEST_URL}/api/generate-posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(TEST_NEWSLETTER)
    });

    console.log(`   Response status: ${response.status} ${response.statusText}`);

    const data = await response.json();

    if (!response.ok) {
      console.log('\n   ❌ API Request FAILED');
      console.log(`   Error: ${data.error || 'Unknown error'}`);
      console.log('\n   Full response:');
      console.log(JSON.stringify(data, null, 2));

      if (response.status === 401) {
        console.log('\n   ⚠️  ISSUE: You need to be authenticated!');
        console.log('   The API endpoint requires a logged-in user.');
        console.log('   This is why posts aren\'t being created.\n');
        console.log('   To fix: You need to log in through the browser first.');
        console.log('   Then the cookie will authenticate API requests.\n');
      }

      process.exit(1);
    }

    console.log('\n   ✅ API Request SUCCEEDED!');
    console.log(`   Newsletter ID: ${data.newsletterId}`);
    console.log(`   Posts Generated: ${data.postsGenerated}`);

    if (data.posts && data.posts.length > 0) {
      console.log('\n   📊 Generated Posts:');
      data.posts.forEach((post, i) => {
        console.log(`\n   Post ${i + 1}:`);
        console.log(`   - Platform: ${post.platform}`);
        console.log(`   - Type: ${post.postType}`);
        console.log(`   - Length: ${post.characterCount} chars`);
        console.log(`   - Preview: ${post.content.substring(0, 100)}...`);
      });
    } else {
      console.log('\n   ⚠️  No posts in response!');
    }

    // Step 3: Try to fetch the preview page
    console.log('\n3️⃣  Testing preview page...');
    console.log(`   URL: ${TEST_URL}/dashboard/newsletters/${data.newsletterId}/preview`);

    const previewResponse = await fetch(`${TEST_URL}/dashboard/newsletters/${data.newsletterId}/preview`);
    console.log(`   Status: ${previewResponse.status} ${previewResponse.statusText}`);

    if (previewResponse.status === 302 || previewResponse.status === 307) {
      const location = previewResponse.headers.get('location');
      console.log(`   ⚠️  Redirected to: ${location}`);
      if (location.includes('/auth/login')) {
        console.log(`   ⚠️  Not authenticated - redirected to login`);
      }
    }

    console.log('\n─'.repeat(70));
    console.log('✅ TEST COMPLETE');
    console.log('\nSummary:');
    console.log(`- API is ${response.ok ? 'working ✅' : 'broken ❌'}`);
    console.log(`- Posts generated: ${data.postsGenerated || 0}`);
    console.log(`- Newsletter ID: ${data.newsletterId || 'none'}`);

  } catch (error) {
    console.log('\n   ❌ Request FAILED with exception:');
    console.log(`   ${error.message}`);
    console.log('\n   Full error:');
    console.error(error);
    process.exit(1);
  }
}

testFullFlow();

// Simple smoke test for AutoBridge backend simple server
// Usage: API_URL=http://localhost:3001/api GEMINI_API_KEY=your-key node smoke.js

const baseUrl = process.env.API_URL || 'http://localhost:3001/api';
const geminiKey = process.env.GEMINI_API_KEY;

async function main() {
  console.log('Base URL:', baseUrl);

  await health();
  const token = await login();
  if (!token) {
    console.error('Login failed; aborting scrape tests');
    return;
  }
  await fetchOnce(token);
  await queueScrape(token);
  await listJobs(token);
}

async function health() {
  const res = await fetch(`${baseUrl}/health`);
  const data = await res.json();
  console.log('\n[health]', res.status, data);
}

async function login() {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'demo', password: 'demo' })
  });
  const data = await res.json();
  console.log('\n[login]', res.status, data);
  return data.token;
}

async function queueScrape(token) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const body = {
    source: 'autotrader',
    urls: ['https://example.com/listing123'],
    options: { saveArtifacts: true }
  };
  if (geminiKey) body.geminiApiKey = geminiKey;

  const res = await fetch(`${baseUrl}/scrape/queue`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json();
  console.log('\n[scrape queue]', res.status, data);
}

async function fetchOnce(token) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const body = { url: 'https://example.com/listing123', source: 'smoke-demo' };
  const res = await fetch(`${baseUrl}/scrape/fetch`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json();
  console.log('\n[scrape fetch]', res.status, data);
}

async function listJobs(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const res = await fetch(`${baseUrl}/scrape/jobs`, { headers });
  const data = await res.json();
  console.log('\n[scrape jobs]', res.status, data);
}

main().catch(err => {
  console.error('Smoke failed', err);
  process.exitCode = 1;
});

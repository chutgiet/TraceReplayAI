import { randomUUID } from 'node:crypto';

const sessionId = randomUUID();
const events = [
  { type: 'copilot.session.start', ts: '00', payload: { sessionName: 'Implement Evidence Service Endpoints', mode: 'agent' } },
  { type: 'copilot.completion.request', ts: '05', payload: { model: 'claude-sonnet-4-20250514', prompt: 'Create evidence bundle CRUD', tokens: 4200 } },
  { type: 'copilot.tool.invoke', ts: '10', payload: { tool: 'file_edit', input: { path: 'services/evidence-service/src/routes/bundles.ts' } } },
  { type: 'copilot.tool.result', ts: '15', payload: { tool: 'file_edit', output: 'File created (142 lines)', success: true } },
  { type: 'copilot.session.end', ts: '30', payload: { outcome: 'completed', filesChanged: 3 } },
].map(e => ({
  vendor: 'github-copilot',
  tenantId: 'org-tracereplay-dev',
  data: {
    sessionId,
    eventId: randomUUID(),
    type: e.type,
    timestamp: `2026-03-24T04:00:${e.ts}.000Z`,
    payload: e.payload,
  },
}));

console.log(`Sending ${events.length} raw Copilot events for session ${sessionId}`);

// Send batch
const batchResp = await fetch('http://localhost:3001/v1/raw-events/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(events),
});
const batchResult = await batchResp.json();
console.log(`Batch status: ${batchResp.status}`);
console.log(JSON.stringify(batchResult, null, 2));

// Wait for normalizer to process
console.log('\nWaiting 5s for normalizer to process...');
await new Promise(r => setTimeout(r, 5000));

// Check if the run appeared
const runsResp = await fetch('http://localhost:3002/v1/runs?limit=10');
const runsResult = await runsResp.json();
console.log(`\nTotal runs: ${runsResult.meta.count}`);
for (const run of runsResult.data) {
  console.log(`  - ${run.runName} (${run.agentId}) — ${run.eventCount} events — status: ${run.status}`);
}

// Check timeline for our raw-ingested run
const rawRun = runsResult.data.find(r => r.id === sessionId);
if (rawRun) {
  console.log(`\nRaw-ingested run found! Checking timeline...`);
  const tlResp = await fetch(`http://localhost:3002/v1/runs/${sessionId}/timeline`);
  const tlResult = await tlResp.json();
  console.log(`Timeline entries: ${tlResult.data?.entries?.length ?? 0}`);
  for (const entry of (tlResult.data?.entries || [])) {
    console.log(`  [${entry.index}] ${entry.event.type} @ ${entry.event.timestamp}`);
  }
} else {
  console.log(`\nRaw-ingested run (${sessionId}) not yet visible in query — normalizer may still be processing`);
  // Check all run IDs
  console.log('Available run IDs:', runsResult.data.map(r => r.id));
}

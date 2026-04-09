// ---------------------------------------------------------------------------
// Prompt template: Run Summary
// ---------------------------------------------------------------------------

export function buildRunSummaryPrompt(runContext: string): string {
  return `You are an AI audit analyst reviewing an AI agent's execution trace.

Analyze the following run events and produce a concise summary.

## Instructions
- Describe what the agent accomplished in 2-3 sentences
- List key decisions made by the agent
- List any side effects (file changes, API calls, commands executed)
- Note the total number of tool calls and model invocations
- Flag anything unusual or noteworthy

## Run Events
${runContext}

## Response Format
Respond in JSON with this structure:
{
  "summary": "Brief description of what the agent did",
  "keyDecisions": ["decision 1", "decision 2"],
  "sideEffects": ["effect 1", "effect 2"],
  "toolCallCount": 0,
  "modelInvocationCount": 0,
  "flags": ["any noteworthy observations"]
}

Respond ONLY with the JSON object, no other text.`;
}

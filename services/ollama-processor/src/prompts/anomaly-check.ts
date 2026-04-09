// ---------------------------------------------------------------------------
// Prompt template: Anomaly Detection
// ---------------------------------------------------------------------------

export function buildAnomalyCheckPrompt(runContext: string): string {
  return `You are an AI audit analyst checking an AI agent execution trace for anomalies.

Analyze the following run events and flag any unusual patterns.

## What to look for
- Excessive tool call failures (more than 30% failure rate)
- Abnormally high token usage (>100k tokens in a single run)
- Long gaps between events (>60 seconds of inactivity)
- Repeated identical tool calls (possible infinite loop)
- Error cascades (multiple errors in sequence)
- Unusual tool usage patterns

## Run Events
${runContext}

## Response Format
Respond in JSON with this structure:
{
  "anomaliesFound": true,
  "anomalies": [
    {
      "type": "excessive_failures|high_token_usage|long_gap|repeated_calls|error_cascade|unusual_pattern",
      "severity": "low|medium|high",
      "description": "What was detected",
      "eventIds": ["relevant event IDs if applicable"]
    }
  ],
  "overallRiskLevel": "low|medium|high"
}

Respond ONLY with the JSON object, no other text.`;
}

/** Visual configuration for each event type category in the timeline. */

export interface EventTypeConfig {
  /** Label for the event type. */
  label: string;
  /** Tailwind color class for the timeline dot/node. */
  dotColor: string;
  /** Tailwind color class for the duration bar. */
  barColor: string;
  /** Tailwind border-left color class for the row accent. */
  borderColor: string;
  /** Tailwind background class for the row. */
  bgColor: string;
  /** Icon character (emoji or symbol) for the timeline node. */
  icon: string;
}

const CONFIG: Record<string, EventTypeConfig> = {
  'run.start': {
    label: 'Run Start',
    dotColor: 'bg-slate-500',
    barColor: 'bg-slate-400',
    borderColor: 'border-l-slate-500',
    bgColor: 'bg-slate-50 dark:bg-slate-950',
    icon: '▶',
  },
  'run.end': {
    label: 'Run End',
    dotColor: 'bg-slate-500',
    barColor: 'bg-slate-400',
    borderColor: 'border-l-slate-500',
    bgColor: 'bg-slate-50 dark:bg-slate-950',
    icon: '■',
  },
  'run.error': {
    label: 'Run Error',
    dotColor: 'bg-red-500',
    barColor: 'bg-red-400',
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-50 dark:bg-red-950',
    icon: '✕',
  },
  'prompt.input': {
    label: 'Prompt Input',
    dotColor: 'bg-blue-500',
    barColor: 'bg-blue-400',
    borderColor: 'border-l-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    icon: '→',
  },
  'prompt.output': {
    label: 'Prompt Output',
    dotColor: 'bg-blue-500',
    barColor: 'bg-blue-400',
    borderColor: 'border-l-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    icon: '←',
  },
  'context.retrieved': {
    label: 'Context Retrieved',
    dotColor: 'bg-cyan-500',
    barColor: 'bg-cyan-400',
    borderColor: 'border-l-cyan-500',
    bgColor: 'bg-cyan-50 dark:bg-cyan-950',
    icon: '📎',
  },
  'context.injected': {
    label: 'Context Injected',
    dotColor: 'bg-cyan-500',
    barColor: 'bg-cyan-400',
    borderColor: 'border-l-cyan-500',
    bgColor: 'bg-cyan-50 dark:bg-cyan-950',
    icon: '💉',
  },
  'tool.call.start': {
    label: 'Tool Call',
    dotColor: 'bg-green-500',
    barColor: 'bg-green-400',
    borderColor: 'border-l-green-500',
    bgColor: 'bg-green-50 dark:bg-green-950',
    icon: '⚙',
  },
  'tool.call.end': {
    label: 'Tool Result',
    dotColor: 'bg-green-500',
    barColor: 'bg-green-400',
    borderColor: 'border-l-green-500',
    bgColor: 'bg-green-50 dark:bg-green-950',
    icon: '✓',
  },
  'tool.call.error': {
    label: 'Tool Error',
    dotColor: 'bg-red-500',
    barColor: 'bg-red-400',
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-50 dark:bg-red-950',
    icon: '✕',
  },
  'approval.requested': {
    label: 'Approval Requested',
    dotColor: 'bg-purple-500',
    barColor: 'bg-purple-400',
    borderColor: 'border-l-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-950',
    icon: '?',
  },
  'approval.granted': {
    label: 'Approval Granted',
    dotColor: 'bg-purple-500',
    barColor: 'bg-purple-400',
    borderColor: 'border-l-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-950',
    icon: '✓',
  },
  'approval.denied': {
    label: 'Approval Denied',
    dotColor: 'bg-purple-500',
    barColor: 'bg-purple-400',
    borderColor: 'border-l-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-950',
    icon: '✕',
  },
  'side_effect.executed': {
    label: 'Side Effect',
    dotColor: 'bg-amber-500',
    barColor: 'bg-amber-400',
    borderColor: 'border-l-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-950',
    icon: '⚡',
  },
  'side_effect.failed': {
    label: 'Side Effect Failed',
    dotColor: 'bg-red-500',
    barColor: 'bg-red-400',
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-50 dark:bg-red-950',
    icon: '⚡',
  },
  'model.request': {
    label: 'Model Request',
    dotColor: 'bg-indigo-500',
    barColor: 'bg-indigo-400',
    borderColor: 'border-l-indigo-500',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950',
    icon: '🤖',
  },
  'model.response': {
    label: 'Model Response',
    dotColor: 'bg-indigo-500',
    barColor: 'bg-indigo-400',
    borderColor: 'border-l-indigo-500',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950',
    icon: '🤖',
  },
  'policy.evaluated': {
    label: 'Policy Evaluated',
    dotColor: 'bg-orange-500',
    barColor: 'bg-orange-400',
    borderColor: 'border-l-orange-500',
    bgColor: 'bg-orange-50 dark:bg-orange-950',
    icon: '📋',
  },
  'policy.violated': {
    label: 'Policy Violated',
    dotColor: 'bg-red-500',
    barColor: 'bg-red-400',
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-50 dark:bg-red-950',
    icon: '🚫',
  },
  annotation: {
    label: 'Annotation',
    dotColor: 'bg-gray-400',
    barColor: 'bg-gray-300',
    borderColor: 'border-l-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-950',
    icon: '📝',
  },
  custom: {
    label: 'Custom',
    dotColor: 'bg-gray-400',
    barColor: 'bg-gray-300',
    borderColor: 'border-l-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-950',
    icon: '•',
  },
};

const DEFAULT_CONFIG: EventTypeConfig = {
  label: 'Unknown',
  dotColor: 'bg-gray-400',
  barColor: 'bg-gray-300',
  borderColor: 'border-l-gray-400',
  bgColor: 'bg-gray-50 dark:bg-gray-950',
  icon: '•',
};

/** Get visual configuration for an event type. */
export function getEventTypeConfig(type: string): EventTypeConfig {
  return CONFIG[type] ?? DEFAULT_CONFIG;
}

/** Extract a human-readable summary from an event's payload + type. */
export function getEventSummary(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case 'run.start':
      return payload.runName ? `Run: ${payload.runName}` : 'Run started';
    case 'run.end':
      return `Status: ${payload.status ?? 'unknown'}`;
    case 'run.error':
      return `${payload.errorType ?? 'Error'}: ${payload.errorMessage ?? ''}`;
    case 'prompt.input':
      return truncate(String(payload.content ?? ''), 80);
    case 'prompt.output':
      return truncate(String(payload.content ?? ''), 80);
    case 'tool.call.start':
      return `${payload.toolName ?? 'unknown tool'}(…)`;
    case 'tool.call.end':
      return `${payload.toolName ?? 'unknown tool'} → ${payload.success ? 'success' : 'failed'}`;
    case 'tool.call.error':
      return `${payload.toolName ?? 'unknown tool'}: ${payload.errorMessage ?? 'error'}`;
    case 'context.retrieved':
      return `Source: ${payload.source ?? 'unknown'}${payload.snippetCount != null ? ` (${payload.snippetCount} snippets)` : ''}`;
    case 'context.injected':
      return `Source: ${payload.source ?? 'unknown'}`;
    case 'approval.requested':
      return `Action: ${payload.requestedAction ?? 'unknown'}`;
    case 'approval.granted':
      return `Granted by ${payload.decidedBy ?? 'unknown'}`;
    case 'approval.denied':
      return `Denied by ${payload.decidedBy ?? 'unknown'}${payload.reason ? `: ${payload.reason}` : ''}`;
    case 'side_effect.executed':
      return `${payload.effectType ?? 'effect'}: ${payload.description ?? ''}`;
    case 'side_effect.failed':
      return `${payload.effectType ?? 'effect'} failed: ${payload.description ?? ''}`;
    case 'model.request':
      return `${payload.modelProvider ?? ''}/${payload.modelId ?? 'unknown'}`;
    case 'model.response':
      return `${payload.modelProvider ?? ''}/${payload.modelId ?? 'unknown'}${payload.latencyMs != null ? ` (${payload.latencyMs}ms)` : ''}`;
    case 'policy.evaluated':
      return `${payload.policyName ?? payload.policyId ?? 'policy'}: ${payload.result ?? ''}`;
    case 'policy.violated':
      return `${payload.policyName ?? payload.policyId ?? 'policy'} violated`;
    default:
      return type;
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

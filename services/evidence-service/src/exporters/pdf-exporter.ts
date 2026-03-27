import PDFDocument from 'pdfkit';

import type { EvidenceBundle } from '../types.js';

// ---------------------------------------------------------------------------
// Section configuration
// ---------------------------------------------------------------------------

/** Available PDF sections. */
export type PdfSection =
  | 'executiveSummary'
  | 'runMetadata'
  | 'eventTimeline'
  | 'toolCalls'
  | 'keyDecisions'
  | 'errors'
  | 'redactionSummary';

/** All sections in their default render order. */
const ALL_SECTIONS: readonly PdfSection[] = [
  'executiveSummary',
  'runMetadata',
  'eventTimeline',
  'toolCalls',
  'keyDecisions',
  'errors',
  'redactionSummary',
] as const;

/** Detail level controls how much event payload data is included. */
export type DetailLevel = 'summary' | 'full';

/** Options for PDF export generation. */
export interface PdfExportOptions {
  /** Which sections to include (default: all). */
  sections?: PdfSection[];
  /** Detail level for event payloads (default: 'summary'). */
  detailLevel?: DetailLevel;
  /** PDF page size (default: 'A4'). */
  pageSize?: 'A4' | 'LETTER';
}

/** Resolved options with all defaults applied. */
interface ResolvedPdfOptions {
  sections: PdfSection[];
  detailLevel: DetailLevel;
  pageSize: 'A4' | 'LETTER';
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const MARGIN = 50;
const FONT_TITLE = 20;
const FONT_HEADING = 14;
const FONT_SUBHEADING = 11;
const FONT_BODY = 9;
const FONT_SMALL = 8;
const LINE_GAP = 2;
const SECTION_GAP = 16;
const ROW_HEIGHT = 16;

const COLOR_HEADING = '#1a1a2e';
const COLOR_BODY = '#333333';
const COLOR_MUTED = '#666666';
const COLOR_ERROR = '#cc3333';
const COLOR_REDACTED = '#cc6600';
const COLOR_TABLE_HEADER_BG = '#f0f0f4';
const COLOR_TABLE_ROW_ALT = '#fafafa';
const COLOR_DIVIDER = '#cccccc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Event types that represent tool calls. */
const TOOL_CALL_TYPES = new Set(['tool.call.start', 'tool.call.end', 'tool.call.error']);

/** Event types that represent errors. */
const ERROR_TYPES = new Set(['run.error', 'tool.call.error', 'side_effect.failed']);

/** Event types that represent approval decisions (key decisions). */
const DECISION_TYPES = new Set([
  'approval.requested',
  'approval.granted',
  'approval.denied',
  'policy.evaluated',
  'policy.violated',
]);

/** Truncate long strings. */
function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 1) + '…';
}

/** Format an ISO timestamp into a concise readable form. */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
  } catch {
    return iso;
  }
}

/** Safe string extraction from an unknown payload field. */
function payloadStr(payload: Record<string, unknown>, key: string): string {
  const val = payload[key];
  if (val === null || val === undefined) return '—';
  if (typeof val === 'string') return val;
  return String(val);
}

/** Compute duration between two ISO timestamps in ms. */
function durationMs(start: string, end: string | null): number | null {
  if (!end) return null;
  try {
    return new Date(end).getTime() - new Date(start).getTime();
  } catch {
    return null;
  }
}

/** Format duration ms to human-readable string. */
function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

/**
 * Safe check for remaining page space and add a new page if needed.
 * Returns the current Y position (may change if page was added).
 */
function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const pageHeight = doc.page.height - MARGIN;
  if (doc.y + needed > pageHeight) {
    doc.addPage();
  }
}

// ---------------------------------------------------------------------------
// EvidencePdfExporter
// ---------------------------------------------------------------------------

/**
 * Generates human-readable PDF summaries of evidence bundles for
 * compliance review.
 *
 * The PDF includes configurable sections: executive summary, run metadata,
 * event timeline, tool calls, key decisions, errors, and redacted fields.
 * Redacted content is shown as `[REDACTED]` throughout the document.
 */
export class EvidencePdfExporter {
  private readonly options: ResolvedPdfOptions;

  constructor(options: PdfExportOptions = {}) {
    this.options = {
      sections: options.sections ?? [...ALL_SECTIONS],
      detailLevel: options.detailLevel ?? 'summary',
      pageSize: options.pageSize ?? 'A4',
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Export an evidence bundle to a PDF buffer.
   *
   * @param bundle - The assembled evidence bundle.
   * @returns A Buffer containing the PDF document.
   * @throws {PdfExportError} if the bundle is not in `complete` status.
   */
  async export(bundle: EvidenceBundle): Promise<Buffer> {
    if (bundle.status !== 'complete') {
      throw new PdfExportError(
        `Cannot export bundle ${bundle.id}: status is "${bundle.status}" (expected "complete")`,
        'BUNDLE_NOT_COMPLETE',
      );
    }

    const doc = new PDFDocument({
      size: this.options.pageSize,
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: `Evidence Bundle — Run ${bundle.runId}`,
        Author: 'TraceReplay AI',
        Subject: `Audit evidence for run ${bundle.runId}`,
        CreationDate: new Date(),
      },
      bufferPages: true,
    });

    const chunks: Buffer[] = [];

    return new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.renderDocument(doc, bundle);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generate a human-readable filename for the PDF export.
   */
  static generateFilename(bundle: EvidenceBundle): string {
    const datePart = bundle.createdAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
    return `evidence-${bundle.runId}-${datePart}.pdf`;
  }

  // -----------------------------------------------------------------------
  // Document rendering
  // -----------------------------------------------------------------------

  private renderDocument(doc: PDFKit.PDFDocument, bundle: EvidenceBundle): void {
    // Title page / header
    this.renderTitle(doc, bundle);

    // Render each enabled section
    const sectionRenderers: Record<PdfSection, () => void> = {
      executiveSummary: () => this.renderExecutiveSummary(doc, bundle),
      runMetadata: () => this.renderRunMetadata(doc, bundle),
      eventTimeline: () => this.renderEventTimeline(doc, bundle),
      toolCalls: () => this.renderToolCalls(doc, bundle),
      keyDecisions: () => this.renderKeyDecisions(doc, bundle),
      errors: () => this.renderErrors(doc, bundle),
      redactionSummary: () => this.renderRedactionSummary(doc, bundle),
    };

    for (const section of this.options.sections) {
      const renderer = sectionRenderers[section];
      if (renderer) {
        renderer();
      }
    }

    // Footer with generation timestamp
    this.renderFooter(doc, bundle);
  }

  // -----------------------------------------------------------------------
  // Title
  // -----------------------------------------------------------------------

  private renderTitle(doc: PDFKit.PDFDocument, bundle: EvidenceBundle): void {
    doc
      .font('Helvetica-Bold')
      .fontSize(FONT_TITLE)
      .fillColor(COLOR_HEADING)
      .text('TraceReplay AI — Evidence Bundle', { align: 'center' });

    doc.moveDown(0.5);

    doc
      .font('Helvetica')
      .fontSize(FONT_SUBHEADING)
      .fillColor(COLOR_MUTED)
      .text(`Bundle ID: ${bundle.id}`, { align: 'center' })
      .text(`Run ID: ${bundle.runId}`, { align: 'center' })
      .text(`Generated: ${formatTimestamp(new Date().toISOString())}`, { align: 'center' });

    if (bundle.isPartialRun) {
      doc.moveDown(0.3);
      doc
        .font('Helvetica-Bold')
        .fontSize(FONT_BODY)
        .fillColor(COLOR_ERROR)
        .text('⚠ PARTIAL RUN — This bundle was assembled while the run was still in progress.', {
          align: 'center',
        });
      if (bundle.partialRunMarker) {
        doc
          .font('Helvetica')
          .fontSize(FONT_SMALL)
          .text(bundle.partialRunMarker, { align: 'center' });
      }
    }

    doc.moveDown(1);
    this.renderDivider(doc);
    doc.moveDown(0.5);
  }

  // -----------------------------------------------------------------------
  // §1 Executive summary
  // -----------------------------------------------------------------------

  private renderExecutiveSummary(doc: PDFKit.PDFDocument, bundle: EvidenceBundle): void {
    ensureSpace(doc, 120);
    this.renderSectionHeading(doc, '1. Executive Summary');

    const totalEvents = bundle.events.length;
    const errorEvents = bundle.events.filter((e) => ERROR_TYPES.has(e.type));
    const toolCalls = bundle.events.filter((e) => e.type === 'tool.call.start');
    const approvals = bundle.events.filter((e) => DECISION_TYPES.has(e.type));
    const meta = bundle.runMetadata;

    const runDuration = meta
      ? formatDuration(durationMs(meta.startedAt, meta.endedAt))
      : '—';

    const lines: string[] = [
      `Run: ${meta?.runName ?? bundle.runId}`,
      `Agent: ${meta?.agentId ?? '—'}`,
      `Status: ${meta?.status ?? '—'}`,
      `Duration: ${runDuration}`,
      `Total events: ${totalEvents}`,
      `Tool calls: ${toolCalls.length}`,
      `Decisions/approvals: ${approvals.length}`,
      `Errors: ${errorEvents.length}`,
      `Redacted fields: ${bundle.redactionAudit.totalRedactedFields}`,
      `Partial run: ${bundle.isPartialRun ? 'Yes' : 'No'}`,
    ];

    doc.font('Helvetica').fontSize(FONT_BODY).fillColor(COLOR_BODY);
    for (const line of lines) {
      doc.text(line, { lineGap: LINE_GAP });
    }

    doc.moveDown(SECTION_GAP / 12);
  }

  // -----------------------------------------------------------------------
  // §2 Run metadata
  // -----------------------------------------------------------------------

  private renderRunMetadata(doc: PDFKit.PDFDocument, bundle: EvidenceBundle): void {
    ensureSpace(doc, 140);
    this.renderSectionHeading(doc, '2. Run Metadata');

    const meta = bundle.runMetadata;
    if (!meta) {
      doc.font('Helvetica').fontSize(FONT_BODY).fillColor(COLOR_MUTED)
        .text('No run metadata available.');
      doc.moveDown(SECTION_GAP / 12);
      return;
    }

    const fields: Array<[string, string]> = [
      ['Run ID', meta.runId],
      ['Tenant ID', meta.tenantId],
      ['Agent', meta.agentId],
      ['Run Name', meta.runName ?? '—'],
      ['Trigger Source', meta.triggerSource ?? '—'],
      ['Parent Run', meta.parentRunId ?? '—'],
      ['Status', meta.status],
      ['Started At', formatTimestamp(meta.startedAt)],
      ['Ended At', meta.endedAt ? formatTimestamp(meta.endedAt) : '—'],
      ['Schema Version', meta.schemaVersion],
      ['Tags', meta.tags.length > 0 ? meta.tags.join(', ') : '—'],
    ];

    this.renderKeyValueTable(doc, fields);
    doc.moveDown(SECTION_GAP / 12);
  }

  // -----------------------------------------------------------------------
  // §3 Event timeline
  // -----------------------------------------------------------------------

  private renderEventTimeline(doc: PDFKit.PDFDocument, bundle: EvidenceBundle): void {
    ensureSpace(doc, 80);
    this.renderSectionHeading(doc, '3. Event Timeline');

    if (bundle.events.length === 0) {
      doc.font('Helvetica').fontSize(FONT_BODY).fillColor(COLOR_MUTED)
        .text('No events recorded.');
      doc.moveDown(SECTION_GAP / 12);
      return;
    }

    // Timeline summary
    if (bundle.timeline?.summary) {
      const s = bundle.timeline.summary;
      doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_MUTED);
      doc.text(
        `${s.eventCount} events | Duration: ${formatDuration(s.durationMs ?? null)} | Has gaps: ${s.hasGaps ? 'Yes' : 'No'}`,
      );
      doc.moveDown(0.3);
    }

    // Table header
    const colWidths = this.getTimelineColWidths(doc);
    this.renderTimelineHeader(doc, colWidths);

    // Table rows
    for (let i = 0; i < bundle.events.length; i++) {
      ensureSpace(doc, ROW_HEIGHT + 2);
      const event = bundle.events[i]!;
      const bgColor = i % 2 === 1 ? COLOR_TABLE_ROW_ALT : undefined;
      this.renderTimelineRow(doc, event, i, colWidths, bgColor);
    }

    doc.moveDown(SECTION_GAP / 12);
  }

  // -----------------------------------------------------------------------
  // §4 Tool calls
  // -----------------------------------------------------------------------

  private renderToolCalls(doc: PDFKit.PDFDocument, bundle: EvidenceBundle): void {
    const toolEvents = bundle.events.filter((e) => TOOL_CALL_TYPES.has(e.type));

    ensureSpace(doc, 80);
    this.renderSectionHeading(doc, '4. Tool Calls');

    if (toolEvents.length === 0) {
      doc.font('Helvetica').fontSize(FONT_BODY).fillColor(COLOR_MUTED)
        .text('No tool calls recorded.');
      doc.moveDown(SECTION_GAP / 12);
      return;
    }

    doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_MUTED)
      .text(`${toolEvents.length} tool call event(s)`);
    doc.moveDown(0.3);

    for (const event of toolEvents) {
      ensureSpace(doc, 50);
      const payload = event.payload as Record<string, unknown>;
      const toolName = payloadStr(payload, 'toolName');
      const status = event.type === 'tool.call.error' ? 'ERROR' : event.type.replace('tool.call.', '');

      doc.font('Helvetica-Bold').fontSize(FONT_BODY).fillColor(COLOR_BODY);
      doc.text(`${toolName} [${status}]`, { continued: true });
      doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_MUTED);
      doc.text(`  ${formatTimestamp(event.timestamp)}`);

      if (this.options.detailLevel === 'full') {
        const args = payload['args'] ?? payload['arguments'] ?? payload['input'];
        const result = payload['result'] ?? payload['output'];
        const errorMsg = payload['error'] ?? payload['errorMessage'];

        if (args !== undefined) {
          doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_BODY);
          const argsStr = typeof args === 'string' ? args : JSON.stringify(args);
          doc.text(`  Args: ${truncate(argsStr, 200)}`);
        }
        if (result !== undefined) {
          doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_BODY);
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          doc.text(`  Result: ${truncate(resultStr, 200)}`);
        }
        if (errorMsg !== undefined) {
          doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_ERROR);
          const errStr = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);
          doc.text(`  Error: ${truncate(errStr, 200)}`);
        }
      }

      doc.moveDown(0.2);
    }

    doc.moveDown(SECTION_GAP / 12);
  }

  // -----------------------------------------------------------------------
  // §5 Key decisions
  // -----------------------------------------------------------------------

  private renderKeyDecisions(doc: PDFKit.PDFDocument, bundle: EvidenceBundle): void {
    const decisionEvents = bundle.events.filter((e) => DECISION_TYPES.has(e.type));

    ensureSpace(doc, 80);
    this.renderSectionHeading(doc, '5. Key Decisions & Approvals');

    if (decisionEvents.length === 0) {
      doc.font('Helvetica').fontSize(FONT_BODY).fillColor(COLOR_MUTED)
        .text('No approval or policy decisions recorded.');
      doc.moveDown(SECTION_GAP / 12);
      return;
    }

    doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_MUTED)
      .text(`${decisionEvents.length} decision event(s)`);
    doc.moveDown(0.3);

    for (const event of decisionEvents) {
      ensureSpace(doc, 40);
      const payload = event.payload as Record<string, unknown>;
      const label = event.type.replace('.', ' → ');

      doc.font('Helvetica-Bold').fontSize(FONT_BODY).fillColor(COLOR_BODY);
      doc.text(`${label}`, { continued: true });
      doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_MUTED);
      doc.text(`  ${formatTimestamp(event.timestamp)}`);

      if (this.options.detailLevel === 'full') {
        const reason = payloadStr(payload, 'reason');
        const decision = payloadStr(payload, 'decision');
        const policyId = payloadStr(payload, 'policyId');

        if (decision !== '—') {
          doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_BODY);
          doc.text(`  Decision: ${decision}`);
        }
        if (reason !== '—') {
          doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_BODY);
          doc.text(`  Reason: ${truncate(reason, 200)}`);
        }
        if (policyId !== '—') {
          doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_BODY);
          doc.text(`  Policy: ${policyId}`);
        }
      }

      doc.moveDown(0.2);
    }

    doc.moveDown(SECTION_GAP / 12);
  }

  // -----------------------------------------------------------------------
  // §6 Errors
  // -----------------------------------------------------------------------

  private renderErrors(doc: PDFKit.PDFDocument, bundle: EvidenceBundle): void {
    const errorEvents = bundle.events.filter((e) => ERROR_TYPES.has(e.type));

    ensureSpace(doc, 80);
    this.renderSectionHeading(doc, '6. Errors');

    if (errorEvents.length === 0) {
      doc.font('Helvetica').fontSize(FONT_BODY).fillColor(COLOR_MUTED)
        .text('No errors recorded.');
      doc.moveDown(SECTION_GAP / 12);
      return;
    }

    doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_ERROR)
      .text(`${errorEvents.length} error event(s)`);
    doc.moveDown(0.3);

    for (const event of errorEvents) {
      ensureSpace(doc, 50);
      const payload = event.payload as Record<string, unknown>;
      const errorMsg = payloadStr(payload, 'error') !== '—'
        ? payloadStr(payload, 'error')
        : payloadStr(payload, 'message');
      const errorType = payloadStr(payload, 'errorType');

      doc.font('Helvetica-Bold').fontSize(FONT_BODY).fillColor(COLOR_ERROR);
      doc.text(`${event.type}`, { continued: true });
      doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_MUTED);
      doc.text(`  ${formatTimestamp(event.timestamp)}`);

      if (errorType !== '—') {
        doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_ERROR);
        doc.text(`  Type: ${errorType}`);
      }
      if (errorMsg !== '—') {
        doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_ERROR);
        doc.text(`  Message: ${truncate(errorMsg, 300)}`);
      }

      if (this.options.detailLevel === 'full') {
        const stack = payloadStr(payload, 'stack');
        if (stack !== '—') {
          doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_MUTED);
          doc.text(`  Stack: ${truncate(stack, 400)}`);
        }
      }

      doc.moveDown(0.2);
    }

    doc.moveDown(SECTION_GAP / 12);
  }

  // -----------------------------------------------------------------------
  // §7 Redaction summary
  // -----------------------------------------------------------------------

  private renderRedactionSummary(doc: PDFKit.PDFDocument, bundle: EvidenceBundle): void {
    ensureSpace(doc, 80);
    this.renderSectionHeading(doc, '7. Redaction Summary');

    const audit = bundle.redactionAudit;

    doc.font('Helvetica').fontSize(FONT_BODY).fillColor(COLOR_BODY);
    doc.text(`Total redacted fields: ${audit.totalRedactedFields}`);
    doc.text(`Events with redactions: ${audit.eventRedactions.length}`);
    doc.moveDown(0.3);

    if (audit.eventRedactions.length === 0) {
      doc.font('Helvetica').fontSize(FONT_BODY).fillColor(COLOR_MUTED)
        .text('No fields were redacted in this bundle.');
      doc.moveDown(SECTION_GAP / 12);
      return;
    }

    // Redactions table
    for (const entry of audit.eventRedactions) {
      ensureSpace(doc, 40);

      doc.font('Helvetica-Bold').fontSize(FONT_SMALL).fillColor(COLOR_REDACTED);
      doc.text(`Event ${truncate(entry.eventId, 36)}`);

      for (const record of entry.redactedFields) {
        doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(COLOR_BODY);
        doc.text(`  • ${record.fieldPath} — [REDACTED] (rule: ${record.ruleId}, action: ${record.action})`);
      }

      doc.moveDown(0.2);
    }

    doc.moveDown(SECTION_GAP / 12);
  }

  // -----------------------------------------------------------------------
  // Footer
  // -----------------------------------------------------------------------

  private renderFooter(doc: PDFKit.PDFDocument, bundle: EvidenceBundle): void {
    // Add page numbers to all pages
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(FONT_SMALL)
        .fillColor(COLOR_MUTED);

      // Bottom-center page number
      const pageText = `Page ${i + 1} of ${pages.count}`;
      doc.text(
        pageText,
        MARGIN,
        doc.page.height - MARGIN + 10,
        { align: 'center', width: doc.page.width - MARGIN * 2 },
      );

      // Bottom-left: bundle reference
      doc.text(
        `Bundle: ${truncate(bundle.id, 36)}`,
        MARGIN,
        doc.page.height - MARGIN + 20,
        { width: 250 },
      );

      // Bottom-right: schema version
      doc.text(
        `Schema v${bundle.bundleSchemaVersion}`,
        doc.page.width - MARGIN - 100,
        doc.page.height - MARGIN + 20,
        { width: 100, align: 'right' },
      );
    }
  }

  // -----------------------------------------------------------------------
  // Shared rendering helpers
  // -----------------------------------------------------------------------

  private renderSectionHeading(doc: PDFKit.PDFDocument, title: string): void {
    doc
      .font('Helvetica-Bold')
      .fontSize(FONT_HEADING)
      .fillColor(COLOR_HEADING)
      .text(title);
    doc.moveDown(0.3);
    this.renderDivider(doc);
    doc.moveDown(0.3);
  }

  private renderDivider(doc: PDFKit.PDFDocument): void {
    const y = doc.y;
    doc
      .strokeColor(COLOR_DIVIDER)
      .lineWidth(0.5)
      .moveTo(MARGIN, y)
      .lineTo(doc.page.width - MARGIN, y)
      .stroke();
  }

  private renderKeyValueTable(doc: PDFKit.PDFDocument, rows: Array<[string, string]>): void {
    const labelWidth = 120;
    const valueX = MARGIN + labelWidth + 8;
    const valueWidth = doc.page.width - MARGIN * 2 - labelWidth - 8;

    for (const [label, value] of rows) {
      ensureSpace(doc, ROW_HEIGHT);
      const y = doc.y;

      doc.font('Helvetica-Bold').fontSize(FONT_BODY).fillColor(COLOR_BODY);
      doc.text(`${label}:`, MARGIN, y, { width: labelWidth });

      doc.font('Helvetica').fontSize(FONT_BODY).fillColor(COLOR_BODY);
      doc.text(value, valueX, y, { width: valueWidth });

      doc.y = y + ROW_HEIGHT;
    }
  }

  private getTimelineColWidths(doc: PDFKit.PDFDocument): { seq: number; type: number; timestamp: number; detail: number } {
    const usable = doc.page.width - MARGIN * 2;
    return {
      seq: Math.round(usable * 0.06),
      type: Math.round(usable * 0.20),
      timestamp: Math.round(usable * 0.28),
      detail: Math.round(usable * 0.46),
    };
  }

  private renderTimelineHeader(
    doc: PDFKit.PDFDocument,
    cols: { seq: number; type: number; timestamp: number; detail: number },
  ): void {
    const y = doc.y;
    const totalWidth = doc.page.width - MARGIN * 2;

    // Background
    doc.save();
    doc.rect(MARGIN, y, totalWidth, ROW_HEIGHT).fill(COLOR_TABLE_HEADER_BG);
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(FONT_SMALL).fillColor(COLOR_HEADING);

    let x = MARGIN + 4;
    doc.text('#', x, y + 3, { width: cols.seq });
    x += cols.seq;
    doc.text('Type', x, y + 3, { width: cols.type });
    x += cols.type;
    doc.text('Timestamp', x, y + 3, { width: cols.timestamp });
    x += cols.timestamp;
    doc.text('Detail', x, y + 3, { width: cols.detail });

    doc.y = y + ROW_HEIGHT;
  }

  private renderTimelineRow(
    doc: PDFKit.PDFDocument,
    event: EvidenceBundle['events'][number],
    index: number,
    cols: { seq: number; type: number; timestamp: number; detail: number },
    bgColor?: string,
  ): void {
    const y = doc.y;
    const totalWidth = doc.page.width - MARGIN * 2;

    // Alternating row background
    if (bgColor) {
      doc.save();
      doc.rect(MARGIN, y, totalWidth, ROW_HEIGHT).fill(bgColor);
      doc.restore();
    }

    // Error events get red text
    const isError = ERROR_TYPES.has(event.type);
    const textColor = isError ? COLOR_ERROR : COLOR_BODY;

    doc.font('Helvetica').fontSize(FONT_SMALL).fillColor(textColor);

    let x = MARGIN + 4;
    doc.text(`${event.sequence ?? index + 1}`, x, y + 3, { width: cols.seq });
    x += cols.seq;
    doc.text(event.type, x, y + 3, { width: cols.type });
    x += cols.type;
    doc.text(formatTimestamp(event.timestamp), x, y + 3, { width: cols.timestamp });
    x += cols.timestamp;

    // Detail column: summarize payload
    const detail = this.summarizeEventPayload(event);
    doc.text(truncate(detail, 80), x, y + 3, { width: cols.detail });

    doc.y = y + ROW_HEIGHT;
  }

  private summarizeEventPayload(event: EvidenceBundle['events'][number]): string {
    const payload = event.payload as Record<string, unknown>;

    switch (event.type) {
      case 'run.start':
        return payloadStr(payload, 'runName') !== '—'
          ? `Name: ${payloadStr(payload, 'runName')}`
          : 'Run started';
      case 'run.end':
        return `Status: ${payloadStr(payload, 'status')}`;
      case 'run.error':
        return `Error: ${payloadStr(payload, 'error')}`;
      case 'prompt.input':
        return `Role: ${payloadStr(payload, 'role')}`;
      case 'prompt.output':
        return `Tokens: ${payloadStr(payload, 'tokenCount')}`;
      case 'tool.call.start':
        return `Tool: ${payloadStr(payload, 'toolName')}`;
      case 'tool.call.end':
        return `Tool: ${payloadStr(payload, 'toolName')} — done`;
      case 'tool.call.error':
        return `Tool: ${payloadStr(payload, 'toolName')} — FAILED`;
      case 'approval.requested':
        return 'Approval requested';
      case 'approval.granted':
        return 'Approved';
      case 'approval.denied':
        return 'Denied';
      default:
        // Fall back to first string field in payload
        for (const [key, val] of Object.entries(payload)) {
          if (typeof val === 'string' && val.length > 0) {
            return `${key}: ${truncate(val, 60)}`;
          }
        }
        return event.type;
    }
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/** Domain error for PDF evidence export failures. */
export class PdfExportError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'PdfExportError';
    this.code = code;
  }
}

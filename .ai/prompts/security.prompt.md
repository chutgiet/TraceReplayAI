# TraceReplay AI — Security Prompt

You are reviewing or implementing security-sensitive code for TraceReplay AI.

TraceReplay AI handles sensitive execution telemetry from AI agents, including prompts, tool calls, retrieved documents, approval decisions, and downstream side effects. Security and privacy are foundational — not bolt-on features.

---

## Threat model awareness

The platform must protect against:
- unauthorized access to execution traces
- leakage of sensitive prompt content or retrieved documents
- tampering with audit evidence
- privilege escalation across tenant boundaries
- injection attacks via ingested telemetry content
- SSRF through connector integrations

---

## Authentication and authorization

- All API endpoints require authentication
- Use JWT or session tokens with short expiry + refresh
- Implement RBAC: viewer, investigator, admin, system
- Tenant isolation: every query must be scoped to the authenticated tenant
- API keys for SDK/service-to-service with scoped permissions

---

## Data protection

### At rest
- Encrypt sensitive fields (prompts, retrieved context, tool outputs)
- Support field-level redaction before persistence
- Retention policies: auto-purge after configurable TTL
- Immutable event store: no updates or deletes to audit events

### In transit
- TLS everywhere — no plaintext HTTP
- mTLS for service-to-service where feasible
- Signed webhooks for outbound notifications

### Redaction
- Redaction engine runs before persistence
- Support regex-based and policy-based redaction rules
- Redacted content replaced with `[REDACTED]` marker + redaction metadata
- Original content never stored after redaction applies
- Redaction rules versioned and auditable

---

## Input validation

- Validate all ingested events against canonical schema
- Reject malformed payloads at the API boundary
- Sanitize string fields to prevent stored XSS
- Size-limit payloads to prevent abuse
- Rate-limit ingestion endpoints per API key / tenant

---

## Secrets management

- No secrets in code, config files, or environment variable defaults
- Use a secrets manager (Vault, AWS Secrets Manager, etc.)
- Rotate API keys and tokens on a schedule
- Log secret access events

---

## Audit logging

- Log all authentication events (login, logout, token refresh, failure)
- Log all authorization decisions (access granted, denied)
- Log administrative actions (user management, policy changes)
- Log data access events (who queried which run)
- Audit logs are append-only and tamper-evident

---

## Connector security

- Connectors to external systems use scoped credentials
- Never forward raw credentials in telemetry
- Validate connector responses before processing
- Timeout and circuit-break external calls
- Log connector errors without leaking credentials

---

## Code review checklist

When reviewing security-sensitive code, verify:
- [ ] No hardcoded secrets or credentials
- [ ] Input validated at boundaries
- [ ] SQL/NoSQL injection prevented (parameterized queries)
- [ ] XSS prevented (output encoding, CSP headers)
- [ ] CSRF protection on state-changing endpoints
- [ ] Authorization checked before data access
- [ ] Tenant isolation enforced in queries
- [ ] Sensitive data redacted in logs
- [ ] Error responses don't leak internal details
- [ ] Dependencies checked for known vulnerabilities

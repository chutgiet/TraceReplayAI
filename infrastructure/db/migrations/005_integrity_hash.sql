-- 005: Add integrity hash chain support to evidence bundles
-- Stores the root hash of the per-event integrity chain for tamper detection.

ALTER TABLE evidence_bundles
  ADD COLUMN root_integrity_hash TEXT;

COMMENT ON COLUMN evidence_bundles.root_integrity_hash IS
  'SHA-256 root hash of the per-event integrity chain. NULL for bundles assembled before integrity was added.';

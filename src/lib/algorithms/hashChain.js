/**
 * Hash Chain — Immutable Ledger Entry Hashing
 * 
 * Each ledger entry is cryptographically linked to the previous one.
 * This creates a tamper-evident audit trail.
 * Uses the Web Crypto API (available in Node.js 18+ and all modern browsers).
 */

/**
 * Generate a SHA-256 hash for a ledger entry, chained from the previous entry.
 *
 * @param {Object} entry - { event_type, amount, affected_users, created_at }
 * @param {string|null} previousHash - hash of the previous entry ('GENESIS' for first)
 * @returns {Promise<string>} hex-encoded SHA-256 hash
 */
export async function generateEntryHash(entry, previousHash) {
  const payload = JSON.stringify({
    prev: previousHash || 'GENESIS',
    type: entry.event_type,
    amount: entry.amount || 0,
    users: (entry.affected_users || []).slice().sort(),
    ts: entry.created_at || new Date().toISOString(),
    desc: entry.description || '',
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify the integrity of a ledger chain.
 *
 * @param {Array} entries - ledger entries ordered by sequence_number ascending
 * @returns {Promise<{ valid: boolean, firstBrokenAt: number|null }>}
 */
export async function verifyChain(entries) {
  if (!entries || entries.length === 0) return { valid: true, firstBrokenAt: null };

  let previousHash = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedHash = await generateEntryHash(entry, previousHash);

    if (entry.entry_hash !== expectedHash) {
      return { valid: false, firstBrokenAt: entry.sequence_number };
    }
    previousHash = entry.entry_hash;
  }

  return { valid: true, firstBrokenAt: null };
}

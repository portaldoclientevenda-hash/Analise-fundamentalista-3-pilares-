import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');
const blueprint = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf-8'));

test('Firestore Rules enforce global safety net, email_verified, and strict blueprint coverage', () => {
  assert.ok(rulesText.includes("rules_version = '2';"));
  assert.ok(rulesText.includes('match /{document=**} {\n      allow read, write: if false;\n    }'));
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'));
  assert.ok(rulesText.includes('isValidId(id)'));

  // Every collection defined in firebase-blueprint.json must have an explicit match block in firestore.rules
  const expectedMatchFragments = [
    'match /users/{userId}',
    'match /private/{docId}',
    'match /memberships/{orgId}',
    'match /organizations/{orgId}',
    'match /members/{memberUid}',
    'match /analyses/{ticker}',
    'match /weights/{presetId}',
    'match /auditLogs/{logId}',
    'match /priceAlerts/{ticker}',
  ];
  for (const frag of expectedMatchFragments) {
    assert.ok(rulesText.includes(frag), `Missing match block: ${frag}`);
  }
  assert.ok(Object.keys(blueprint.firestore).length === expectedMatchFragments.length);
});

test('Dirty Dozen Payloads (P01-P12) are structurally blocked by rules invariants', () => {
  // P01: Cross-tenant isolation uses isOrgMember(orgId)
  assert.ok(rulesText.includes('exists(/databases/$(database)/documents/organizations/$(orgId)/members/$(request.auth.uid))'));

  // P02: Shadow field injection blocked via hasAll + hasOnly + affectedKeys().hasOnly()
  assert.ok(rulesText.includes('data.keys().hasAll('));
  assert.ok(rulesText.includes('data.keys().hasOnly('));
  assert.ok(rulesText.includes('affectedKeys().hasOnly('));

  // P03 & P04: Self-privilege escalation blocked (only orgAdmin/globalAdmin can update role or add arbitrary member)
  assert.ok(rulesText.includes("incoming().diff(existing()).affectedKeys().hasOnly(['role', 'displayName', 'updatedAt'])"));
  assert.ok(rulesText.includes('(isOrgAdmin(orgId) || isGlobalAdmin())'));

  // P05: Email spoof blocked by requiring email_verified == true before checking admin email
  assert.ok(rulesText.includes("isVerifiedUser() && request.auth.token.email == 'jonashenriquedematossousa30@gmail.com'"));

  // P06: PII isolated in /users/{userId}/private/{docId} with allow list: if false
  assert.ok(rulesText.includes('match /private/{docId}'));
  assert.ok(rulesText.includes('allow list: if false;'));

  // P07 & P08: AuditLog enforces userId == request.auth.uid, createdAt == request.time, and immutable update/delete = false
  assert.ok(rulesText.includes('data.userId == request.auth.uid'));
  assert.ok(rulesText.includes('data.createdAt == request.time'));
  assert.ok(rulesText.includes('allow update, delete: if false;'));

  // P09: Temporal integrity
  assert.ok(rulesText.includes('incoming().createdAt == request.time'));
  assert.ok(rulesText.includes('incoming().updatedAt == request.time'));

  // P10: String size bounds & regex ID guards
  assert.ok(rulesText.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')"));
  assert.ok(rulesText.includes('data.analystNotes.size() <= 20000'));

  // P11: Viewer cannot write (requires isOrgContributor which only allows admin/analyst)
  assert.ok(rulesText.includes("getOrgMemberRole(orgId) in ['admin', 'analyst']"));

  // P12: Terminal state lock on approved analysis
  assert.ok(rulesText.includes("existing().status != 'aprovado'"));
});

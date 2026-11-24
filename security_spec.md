# Security Specification & Payload-First TDD (`security_spec.md`)

## 1. Data Invariants (Multi-Tenant Ápice Research)

1. **Tenant Isolation:** Every organizational analysis (`analyses`), scoring weight preset (`weights`), membership (`members`), and audit trail (`auditLogs`) belongs strictly to a single `organizationId` (`orgId`). No authenticated user outside `/organizations/{orgId}/members/{uid}` (and not verified admin) may read or write tenant data.
2. **Identity & Email Verification Integrity:** Every write operation requires `request.auth != null && request.auth.token.email_verified == true`. Any `ownerId`, `updatedBy`, `addedBy`, or `userId` field in newly created documents must match `request.auth.uid`.
3. **PII Isolation (Split Collection):** Email addresses reside strictly in `/users/{userId}/private/info` (readable only by `userId == request.auth.uid` or bootstrapped verified admin), never exposed in public `/users/{userId}` documents or readable by arbitrary authenticated users.
4. **Role & Privilege Escalation Prevention:** A non-admin member (`analyst` or `viewer`) cannot promote themselves to `admin`, cannot modify `/organizations/{orgId}` ownership (`ownerId`), and `viewer` roles are strictly read-only on `analyses` and `weights`.
5. **Immutable Audit Trail:** Documents in `/organizations/{orgId}/auditLogs/{logId}` are append-only (`allow update, delete: if false;`) and must carry server timestamp `createdAt == request.time`.
6. **Temporal & Structural Integrity:** All `createdAt` / `updatedAt` timestamps must match `request.time`; document IDs must match `^[a-zA-Z0-9_-]{1,128}$`; all strings/maps/lists enforce strict `.size()` caps and `keys().hasAll(...) && keys().hasOnly(...)` / `affectedKeys().hasOnly(...)` guards.
7. **Terminal State Lock:** Once an analysis status transitions to `'aprovado'`, analysts cannot overwrite it without an `'admin'` override (`isOrgAdmin(orgId) || isGlobalAdmin()`).

---

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: `PERMISSION_DENIED`)

1. **P01 — Cross-Tenant Read/Write:** User B (member of `org_beta`) attempts `get`/`create` at `/organizations/org_alpha/analyses/WEGE3`.
2. **P02 — Shadow Field Injection (`hasOnly` Bypass):** Member of `org_alpha` sends `{ ..., isVerified: true, ghostFlag: 1 }` when creating `/organizations/org_alpha/analyses/WEGE3`.
3. **P03 — Self-Privilege Escalation on Member Creation:** User B creates `/organizations/org_alpha/members/userB` with `role: "admin"` without being org owner or org admin.
4. **P04 — Role Self-Promotion on Update:** Existing `analyst` in `org_alpha` attempts `update` on `/organizations/org_alpha/members/analystUid` changing `role` from `"analyst"` to `"admin"`.
5. **P05 — Unverified Email Spoof:** Authenticated user with `email: "jonashenriquedematossousa30@gmail.com"` and `email_verified: false` attempts admin write/read.
6. **P06 — PII Blanket Harvest:** User B attempts `get` or `list` on `/users/userA/private/info`.
7. **P07 — Identity Spoofing on Audit Log:** Member creates `/organizations/org_alpha/auditLogs/log1` setting `userId: "someone_else"` instead of `request.auth.uid`.
8. **P08 — Audit Log Tampering / Deletion:** Org admin attempts `update` or `delete` on `/organizations/org_alpha/auditLogs/log1`.
9. **P09 — Fake Client Timestamp Forgery:** User creates an analysis with `createdAt: Timestamp(2020-01-01)` instead of `serverTimestamp()` (`request.time`).
10. **P10 — Oversized / ID Poisoning Attack:** User attempts `create` at `/organizations/org_alpha/analyses/${'A'.repeat(250)}` or sends `analystNotes` > 20,000 chars.
11. **P11 — Viewer Write Bypass:** Org member with `role: "viewer"` attempts `update` on `/organizations/org_alpha/analyses/ITUB4`.
12. **P12 — Terminal State Overwrite:** Non-admin `analyst` attempts `update` on an analysis whose existing `status == "aprovado"`.

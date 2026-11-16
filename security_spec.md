# NovaHospeda Security Specification

## 1. Data Invariants
1. **User Isolation & PII Protection**: Every `users/{uid}` document contains the user's email and usage counters and is strictly readable only by the owning verified user (`request.auth.uid == uid`) or a verified platform admin.
2. **No Self-Elevated Roles**: Users creating their own `/users/{uid}` profile MUST set `role == "user"` and `status == "active"`. Users can never mutate `role`, `status`, or `uid`.
3. **Site Ownership & Immutable Creator**: Every `/sites/{siteId}` document has an immutable `ownerId` matching `request.auth.uid` on creation. Non-admins cannot transfer `ownerId`, cannot bypass `status == "blocked"`, and cannot exceed schema bounds.
4. **Master Gate on Deployments**: Every `/sites/{siteId}/deployments/{deploymentId}` subcollection write verifies via `get()` that the parent site exists and belongs to `request.auth.uid` (or the caller is admin).
5. **Verified Accounts Only**: All authenticated writes require `request.auth.token.email_verified == true`.
6. **Strict Temporal Integrity**: `createdAt` and `updatedAt` must match `request.time` on creation/update.

## 2. Dirty Dozen Adversarial Payloads
1. **Self-Admin Escalation**: `POST /users/{uid}` with `{ role: "admin", ... }` -> DENIED.
2. **Shadow Field Injection**: `PATCH /users/{uid}` with `{ displayName: "Bob", isVerifiedAdmin: true }` -> DENIED via `hasOnly`.
3. **Cross-User Site Hijack**: `PATCH /sites/{siteId}` by non-owner `{ name: "Hacked" }` -> DENIED.
4. **Unverified Email Spoof**: Request with `token.email == "dvenancio767@gmail.com"` and `email_verified == false` -> DENIED.
5. **ID Poisoning**: Document ID with `../admin` or 2KB string -> DENIED via `isValidId`.
6. **Orphan Deployment**: Creating `/sites/nonexistent/deployments/dep1` -> DENIED via `exists()` on parent site.
7. **Owner Transfer Attack**: `PATCH /sites/{siteId}` changing `ownerId` to another UID -> DENIED.
8. **Blocked Site Resurrection**: Non-admin changing `status` from `"blocked"` back to `"online"` -> DENIED.
9. **Blanket User List Scraping**: Non-admin running `list` on `/users` -> DENIED.
10. **Settings Tampering**: Non-admin updating `/platformSettings/limits` with `maxSitesPerUser: 9999` -> DENIED.
11. **Backdated Timestamp**: Creating site with `createdAt` in 2020 instead of `request.time` -> DENIED.
12. **Unbounded String DoW**: Creating site with 50KB `name` or `slug` -> DENIED via `.size()` checks.

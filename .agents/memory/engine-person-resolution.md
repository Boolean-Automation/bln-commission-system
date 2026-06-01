---
name: Commission engine person resolution & test-data coupling
description: How the rule engine links entries to people, and why deleting seed people can orphan real commission entries.
---

# Engine person resolution

- The rule engine resolves people **by name** (`findPersonByName` matching `job.salesRep` / `job.manager` against `people.name`). It does NOT use FK-linked person rows from a source — names must match.
- `sm_cut` (Sales Manager Override) is a **blanket** rule: it matches every person who is a sales manager via `positionContains` (case-insensitive substring of `people.position`) and/or `rolesInclude` (matches `people.roles[]`), with a legacy single `managerName` fallback. One SM entry per matching manager per job.
  - **Why blanket:** the original seed shipped it hardcoded to a single test person; the owner clarified it should pay all sales managers.
  - Real positions are full labels like `"Sales Manager (SM1)"`, so the matcher must be substring-based, not exact (`"sales manager"`), and must treat an empty/whitespace matcher as absent (else `"".includes("")` matches everyone).

# Seed demo rules are coupled to test people

- `seedParagon.ts` plants demo **rule instances hardcoded to seed/test people** (by name). Deleting test personnel can orphan real rule-derived commission entries that those rules generated against real jobs.
- **Before deleting test people:** check `commission_entries.person_id` references. Orphaned rule-derived entries pointing at a deleted person must be deleted manually (with their `commission_events`) BEFORE recompute — otherwise recompute reconciliation turns them into voided ghost rows rather than removing them.
- After repointing a rule to a real person, recompute regenerates entries under the new person's id (dedupeKey changes because it embeds personId).

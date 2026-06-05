---
name: shadcn Select clear/Any sentinel pattern
description: How to safely add a "clear"/"Any" option to a shadcn Select whose options are arbitrary user-supplied strings.
---

shadcn/Radix `SelectItem` forbids an empty-string `value`. When a Select needs a
"clear"/"Any" option AND its other options are arbitrary user-supplied strings
(e.g. configured position names), a naive clear sentinel like `"__any__"` can
collide with a real option of the same name.

**Rule:** namespace every real option value with a fixed prefix (e.g. `"v:" + name`)
and decode on change; use a distinct clear sentinel (`"__any__"`) for the empty value.
Because all real values carry the prefix, no user-supplied name — even literally
`"__any__"` — can ever collide with the clear item.

**Why:** guarantees reliable current-value preservation and clear behavior regardless
of what the user names things; avoids needing reserved-name validation server-side.

**How to apply:** see `PositionSelect.tsx` in the commissions web app — `encode`/`decode`
helpers wrap option values; the trigger renders `CLEAR` when the value is empty.

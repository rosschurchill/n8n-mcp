# n8n-MCP — Wishlist + Handover from BuildCompare Social-Automation Chat

**Date:** 2026-06-03
**From:** BuildCompare marketing chat (bc-n8n social auto-poster build)
**Context:** Building a scheduled social-media auto-poster on **bc-n8n** (a *separate* n8n instance from the trading one) — drains a `bc_social_queue` Data Table and posts to FB/IG on a M/W/F cron.

This complements the existing [`WISHLIST.md`](WISHLIST.md) (from the trading_n8n / HEAD 2 chat, 2026-03-30). **Where an item overlaps, I've cross-referenced it — the overlap is the signal: these gaps bite across multiple independent projects.**

---

## ⚠️ Two n8n instances now use this MCP — note for whoever works on it

| Instance | Used by | MCP config | API URL |
|---|---|---|---|
| **n8n** (trading) | trading_n8n chats | `.mcp.json` here → `n8n-mcp` | `https://n8n.theshellnet.com` |
| **bc-n8n** (BuildCompare) | this chat | top-level `~/.claude.json` → `n8n-bc` MCP entry | `http://10.0.10.200:5699` |

Both run the same `n8n-mcp` codebase via npx. **Local clone here is v2.40.5; the running MCP is npx `n8n-mcp@2.54.0`** — clone is behind. Pull upstream before hacking, or the diff base is wrong. `git status` shows local edits to `dist/` + `data/nodes.db` (build artefacts) — likely stale, verify before committing anything.

---

## 🔴 THE blocker that triggered this handover

### Can't trigger schedule- or manual-triggered workflows via the MCP
**This is a duplicate of existing [`WISHLIST.md`](WISHLIST.md) #4 — now hit by a second project, so it's promoted to top priority.**

- **Symptom:** `n8n_test_workflow` only fires **webhook / form / chat** triggers. Our auto-poster uses a **Schedule** trigger; the per-platform posters use **Manual** triggers. The MCP can build/read/edit them perfectly but **cannot press "go"** — so we literally cannot test-fire a post without a human opening the n8n UI and clicking Execute.
- **Impact:** Breaks the "agent builds AND validates the automation end-to-end" loop. Every test needs a human in the n8n UI. For an autonomous social poster this is the whole point of failure.
- **Root cause (important):** This is **n8n's public REST API limitation**, not purely an MCP bug. The public API deliberately has no "execute arbitrary workflow now" endpoint — only webhook URLs are externally invokable. So the fix needs one of the approaches below.

#### Viable fixes (in rough order of effort)

1. **★ Workflow-Runner webhook pattern (no MCP change needed — ship this first):**
   Create ONE webhook-triggered workflow `__mcp_runner` that accepts `{ "workflowId": "..." }` and uses an **Execute Workflow** node (run-by-ID, dynamic) to invoke the target. The MCP *can* trigger a webhook, so `n8n_test_workflow` → hits `__mcp_runner` → runs any target workflow regardless of its trigger type. Sidesteps the API limitation entirely. The MCP could even auto-create this runner on first use and wrap it as a new tool: `n8n_execute_workflow(workflowId)`.
2. **n8n CLI execution** — `n8n execute --id <workflowId>` runs a workflow once. Requires the MCP (or a sidecar) to have shell access to the n8n container. bc-n8n is in Portainer on QNAP; the MCP runs on Ross's laptop via npx → no container access today. Would need an ops-mcp/ssh bridge.
3. **n8n internal (UI) API** — the `/rest/workflows/:id/run` endpoint the UI uses. Session-auth, undocumented, brittle across versions. Last resort.

**MCP ask:** add `n8n_execute_workflow(workflowId, inputData?)` backed by approach #1 (auto-provision a runner webhook). This single tool closes the loop for every non-webhook workflow.

---

## 🟠 New friction hit this session (not in the trading wishlist)

### A. `updateNode` partial-update ergonomics
- `n8n_update_partial_workflow` `updateNode` rejects a `parameters` key — it requires an `updates` object with **dot-path keys** (e.g. `"parameters.assignments.assignments[1].value"`). The error message is good, but: (a) it cost a round-trip to discover, (b) dot-path-into-array-element worked but isn't documented in the tool description. **Ask:** document the dot-path-with-array-index form in the tool description, or accept a `parameters` object as an alias.

### B. `resourceLocator` fields need `cachedResultName` or the UI dropdown breaks
- Creating a Data Table node via `n8n_create_workflow` with `dataTableId: {__rl:true, mode:"id", value:"<id>"}` validates with a warning: without `cachedResultName`, the n8n UI shows "Choose..." and **dependent metadata fetches (column lists for the resourceMapper) never fire**. So the node works at runtime but is broken-looking + uneditable in the UI until you re-pick the table. **Ask:** `n8n_create_workflow` / `update` should auto-populate `cachedResultName` by resolving the resource ID against the live instance (it has API access; it can look up the table name).

### C. Data Table `update` resourceMapper is opaque to construct by hand
- The `columns` resourceMapper (`{mappingMode:"defineBelow", value:{...}}`) works when authored as raw JSON, but the **schema sub-object** that the UI auto-populates from the live table is missing, so the mapping is fragile and the UI may not render the field mapping correctly. **Ask:** a higher-level convenience for "update row by filter with these column values" that doesn't require hand-building resourceMapper internals — or auto-resolve the schema like (B).

### D. Posting-platform credential reuse is invisible
- We have one `facebookGraphApi` cred (`9xIMj5DRITP0FseY`) powering FB + IG. `n8n_manage_credentials list` is great (this MCP version has it — closes trading-wishlist #10 ✅). Minor **ask:** `includeUsage` is there but slow; a per-credential "which workflows + which nodes" index would help audit blast radius before rotating a token.

---

## ✅ Things that already improved since the trading wishlist (credit where due)

- **`n8n_manage_datatable`** full CRUD now exists (commits #640/#650/#651/#652/#654) — we used it heavily this session to read/insert/update the social queue. Closes trading-wishlist's implicit "no table access" gap. Worked well once double-encoding bugs (#652) were fixed.
- **`n8n_manage_credentials`** list/get/create — closes trading-wishlist #10.
- **`transferWorkflow`** in partial updates (#649).

---

## 📋 Consolidated priority ask (if only one thing gets built)

**`n8n_execute_workflow(workflowId)` via the auto-provisioned Workflow-Runner webhook (fix #1 above).**

It's the highest-leverage single addition: it closes the build→test→verify loop for schedule/manual workflows, which is the #1 repeat blocker across both the trading pipeline AND BuildCompare social automation. Everything else here is ergonomics; this one is capability.

---

## Where BuildCompare is parked until this lands

- **FB auto-poster** built + inactive on bc-n8n (`qgJZ7Pd17zKNg3gn`), M/W/F 08:00 UK, drains `bc_social_queue`. **Validated, not yet test-fired** — blocked on the trigger gap (need to Execute in n8n UI manually, or this MCP feature).
- **IG poster** (`N7AkMnncw7idSh5L`) — manual trigger, caption fixed, public og-image. Same trigger-gap situation.
- Once `n8n_execute_workflow` exists, the agent can test-fire + verify both autonomously, then activate the cron.

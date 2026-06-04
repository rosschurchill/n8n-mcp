# n8n MCP — Wishlist from HEAD 2 Chat

**Date**: 2026-03-30
**From**: HEAD 2 Research Pipeline (trading_n8n chat)
**Context**: Building 15 n8n workflows programmatically for a trading intelligence pipeline

---

## Critical Bugs / Blockers

### 1. `$env` access blocked for new workflows on n8n 2.x
- **Problem**: Workflows created via API or imported via UI on n8n 2.14.0 get `"error": "access to env vars denied"` when using `{{ $env.MY_KEY }}` in HTTP node parameters
- **Workaround found**: Old workflows (pre-upgrade from 1.82.1) retain `$env` access. New ones don't.
- **Root cause**: n8n 2.x blocks `$env` in expressions by default. Setting `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` in the container env would fix it globally.
- **MCP ask**: Could the MCP detect this and warn? Or provide a tool to check/set n8n instance-level settings like `N8N_BLOCK_ENV_ACCESS_IN_NODE`?

### 2. Schedule triggers never fire for API-created workflows
- **Problem**: Workflows created via `n8n_create_workflow` show `active: true` and appear in the activation log on restart, but the schedule trigger never fires. Zero executions ever recorded.
- **Workaround**: Import via n8n UI + restart n8n. UI-imported workflows fire correctly.
- **Affects**: Every workflow we created programmatically needed UI re-import
- **MCP ask**: Could `n8n_create_workflow` or `activateWorkflow` include a trigger verification step? E.g., after activation, poll for 1 execution within the expected interval and warn if none appears.

### 3. `n8n_autofix_workflow` expression-format fixes don't persist
- **Problem**: The autofix tool reports "Fixed 1 expression format error" (adding `=` prefix to SQL queries), but subsequent `n8n_validate_workflow` shows the same error still present. The fix is applied in memory but not saved.
- **How we fixed it**: Ran autofix multiple times. Eventually it stuck after the MCP developer fixed a save bug.
- **MCP ask**: After applying fixes, the tool should verify persistence by re-reading the workflow and confirming the fix is saved.

---

## Feature Requests

### 4. Execute workflow on demand (schedule triggers)
- **Problem**: `n8n_test_workflow` only supports webhook/form/chat triggers. Schedule-triggered workflows can't be executed programmatically.
- **Use case**: We need to test WF4 after Code node changes without waiting 30 min for the schedule
- **MCP ask**: Add support for triggering any workflow type — either via n8n's internal execution API or by simulating the trigger

### 5. Workflow execution monitoring
- **Problem**: With `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none`, we can't tell if a workflow ran successfully. Only errors are saved.
- **Use case**: "Did WF4 actually execute in the last hour?" — currently unanswerable
- **MCP ask**: Could the MCP track execution counts by watching the n8n logs (`Enqueued execution X`) and correlate them to workflow IDs? Or expose a "last trigger time" per workflow?

### 6. Bulk operations
- **Problem**: Updating 13 workflows one at a time is slow. The autofix needed to run on each individually.
- **MCP ask**: `n8n_autofix_all_workflows` or batch mode for `n8n_update_partial_workflow` that takes a list of workflow IDs

### 7. Connection management in partial updates
- **Problem**: `addConnection` in partial updates frequently fails with "node not found" even when the node was just added in the same operation batch. The validator runs before all operations complete.
- **Workaround**: Use `n8n_update_full_workflow` instead, but that requires sending the entire workflow
- **MCP ask**: Atomic add-node-and-connect operations, or deferred validation until all operations in a batch are applied

### 8. Environment variable management
- **Problem**: No way to check or manage n8n instance-level settings via MCP
- **MCP ask**: `n8n_get_settings` / `n8n_update_settings` tools that can read/set instance configuration like `N8N_BLOCK_ENV_ACCESS_IN_NODE`, `EXECUTIONS_DATA_SAVE_ON_SUCCESS`, etc.

### 9. Workflow diff/compare
- **Problem**: After multiple MCP updates, hard to tell what changed. No way to diff the current live workflow against the on-disk export.
- **MCP ask**: `n8n_diff_workflow` that compares a workflow ID against a local JSON file and shows what changed

### 10. Credential management
- **Problem**: Can't create or list n8n credentials via MCP. WF2 had a Redis XADD node with missing credentials that blocked autofix.
- **MCP ask**: `n8n_list_credentials` / `n8n_create_credential` tools

---

## Nice to Have

### 11. Workflow templates from existing workflows
- Export a working workflow as a reusable template with placeholder credentials

### 12. Execution replay
- Re-run a specific execution ID with the same input data (useful for debugging Code node changes)

### 13. Node output preview
- For a given workflow + node name, show what the last execution's output looked like without needing to save executions

### 14. Health dashboard
- Single MCP call that returns: all workflows active/inactive, last execution time per workflow, current error rate, trigger registration status

---

## Context: What We Used the MCP For

Over 3 days of intensive development:
- Created 5 workflows programmatically (WF14, WF15, WF16, WF17, WF4)
- Ran autofix on all 15 workflows (106+ fixes)
- Toggled activate/deactivate to fix trigger registration
- Updated Code nodes and SQL queries across 13 workflows
- Validated workflow structures and debugged execution errors
- Deleted and recreated workflows multiple times to work around trigger bugs

The MCP was invaluable for programmatic workflow management. The main friction was: trigger registration bugs, env var access restrictions, and the addConnection validation issue.

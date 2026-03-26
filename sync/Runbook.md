# Capacity Intelligence Sync — Runbook

## Architecture

```
Notion (Brain Dump Inbox)
        ↓  Notion REST API  (every 15 min)
Google Apps Script (Code.gs)
        ↓  upsert by task_id
Google Sheets → tasks_log tab
        ↓  COUNTIF / SUMIF formulas
metrics + dashboard tabs
```

---

## One-Time Setup

### Step 1 — Open Apps Script editor

1. Open your Google Sheet
2. Extensions → Apps Script
3. Delete any existing code in `Code.gs`
4. Paste the full contents of `sync/Code.gs` from this repo
5. Save (Ctrl+S or Cmd+S)

### Step 2 — Store secrets in PropertiesService

Edit the `setProperties()` function in `Code.gs`:

```js
function setProperties() {
  PropertiesService.getScriptProperties().setProperties({
    NOTION_API_KEY:       'secret_YOUR_ACTUAL_KEY',
    NOTION_DATABASE_ID:   'YOUR_DATABASE_UUID',
    // Leave the rest as defaults or customize:
    TASKS_LOG_SHEET_NAME:  'tasks_log',
    METRICS_SHEET_NAME:    'metrics',
    DASHBOARD_SHEET_NAME:  'dashboard',
    WEEKLY_LOG_SHEET_NAME: 'weekly_log',
  });
}
```

Run `setProperties()` once using the Run button (select it from the function dropdown).

**After running**: clear the key values from the function body — they are now stored securely in PropertiesService and don't need to stay in the code.

**Where to find your Notion database ID:**
- Open the Brain Dump Inbox database in Notion
- Copy the URL: `https://www.notion.so/YOUR-WORKSPACE/Brain-Dump-Inbox-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
- The 32-character hex at the end (with or without dashes) is the database ID

**Where to create a Notion API key:**
- Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
- Create a new integration with read access
- Share your Brain Dump Inbox database with this integration (open the database → ··· → Connections → Add your integration)

### Step 3 — Initialize headers

Run `ensureHeaders()` from the Apps Script editor.

This writes the 14-column header row to `tasks_log` if row 1 is empty.
**Safe to run on a sheet with existing data** — it checks before writing.

### Step 4 — First manual sync

Run `syncNotionToTasksLog()` from the Apps Script editor.

Check the Execution Log (View → Logs) for:
```
Sync complete. Updated: X, Inserted: X
syncNotionToTasksLog OK — Updated: X, Inserted: X, Total fetched: X
```

### Step 5 — Validate metrics

Run `validateMetrics()`. Check logs for output like:
```
=== Metrics Validation ===
Total Tasks Logged:    42
Tasks Completed:       18
Tasks in Backlog:      24
Total Capacity Spent:  87.50
Total Delegation Value:21.60
Validation passed — no issues found.
```

If issues are reported, the function will auto-call `repairFormulas()`.

### Step 6 — Install scheduled trigger

Run `createTimeTrigger()` once.

This installs a 15-minute time-based trigger. Confirm by opening the Triggers panel (clock icon ⏰ in the left sidebar). You should see `syncNotionToTasksLog` with a 15-minute interval.

---

## Column Layout (tasks_log)

| Col | Header           | Source                            |
|-----|------------------|-----------------------------------|
| A   | task_id          | Notion page ID (UUID)             |
| B   | task_name        | Item (title)                      |
| C   | domain           | Domain (select)                   |
| D   | assignee         | Assignee (person, joined)         |
| E   | delegated        | Delegated (checkbox → TRUE/FALSE) |
| F   | effort           | Effort (hrs) (number)             |
| G   | cognitive_load   | Cognitive Load (number)           |
| H   | founder_only     | Founder Only (checkbox)           |
| I   | repeatable       | Repeatable (checkbox)             |
| J   | status           | Status (Done→Completed)           |
| K   | created_date     | Created Date (YYYY-MM-DD)         |
| L   | completed_date   | Completed Date (YYYY-MM-DD)       |
| M   | capacity_spent   | Formula: F*G*(H?1.5:1)            |
| N   | delegation_value | Formula: E?F*0.6:0                |

### Canonical formulas (row 2 example)

**capacity_spent (M2):**
```
=IF(OR(F2="",G2=""),"",F2*G2*IF(H2=TRUE,1.5,1))
```

**delegation_value (N2):**
```
=IF(F2="","",IF(E2=TRUE,F2*0.6,0))
```

---

## Status Normalization

| Notion Value | Sheet Value |
|---|---|
| Done | Completed |
| Inbox | Inbox |
| Triage | Triage |
| Planned | Planned |
| Dropped | Dropped |

Metrics that filter on `status = Completed` will correctly count Notion "Done" tasks.

---

## Metrics Formulas (for metrics tab)

Add these to your `metrics` tab. Adjust row numbers to match your layout.

```
Total Tasks Logged:
=COUNTA(tasks_log!A:A)-1

Tasks Completed:
=COUNTIF(tasks_log!J:J,"Completed")

Tasks in Backlog:
=COUNTIF(tasks_log!J:J,"<>Completed")-1

Total Estimated Hours:
=SUM(tasks_log!F:F)

Total Capacity Spent:
=SUM(tasks_log!M:M)

Total Delegation Value:
=SUM(tasks_log!N:N)

Average Delegation Value per Task:
=IFERROR(SUM(tasks_log!N:N)/COUNTIF(tasks_log!J:J,"Completed"),0)

Backlog Delta (last 7 days):
=COUNTIFS(tasks_log!K:K,">="&TEXT(TODAY()-7,"YYYY-MM-DD"))
 -COUNTIFS(tasks_log!J:J,"Completed",tasks_log!L:L,">="&TEXT(TODAY()-7,"YYYY-MM-DD"))

SGR (as decimal ratio — NOT percent):
=IFERROR(
  COUNTIFS(tasks_log!J:J,"Completed",tasks_log!L:L,">="&TEXT(TODAY()-7,"YYYY-MM-DD"))
  /MAX(1,COUNTIFS(tasks_log!K:K,">="&TEXT(TODAY()-7,"YYYY-MM-DD"))),
  0)

Founder-only Tasks Created (last 7 days):
=COUNTIFS(tasks_log!H:H,TRUE,tasks_log!K:K,">="&TEXT(TODAY()-7,"YYYY-MM-DD"))

Founder-only Tasks Completed:
=COUNTIFS(tasks_log!H:H,TRUE,tasks_log!J:J,"Completed")

Repeatable Tasks Done by Founder:
=COUNTIFS(tasks_log!H:H,TRUE,tasks_log!I:I,TRUE,tasks_log!J:J,"Completed")
```

**SGR displays as a number like `1.23` — format the cell as "Number" with 2 decimal places, NOT as a percent.**

---

## Manual Operations

| Function | When to run |
|---|---|
| `syncNotionToTasksLog()` | Force an immediate sync |
| `validateMetrics()` | Spot-check after sync or when metrics look wrong |
| `repairFormulas()` | If cols M/N formulas are missing or broken |
| `generateDailyCapacitySummary()` | Pull today's capacity status + moves |
| `generateWeeklyCapacitySummary()` | Pull this week's capacity review |
| `appendWeeklySnapshot()` | Archive this week's metrics to weekly_log |
| `createTimeTrigger()` | Install/reinstall the 15-min auto-sync |
| `removeSyncTrigger()` | Pause automatic syncing |

All output appears in the Execution Log (View → Logs in Apps Script editor).

---

## Validation Tests

### Test 1 — New task
1. Create a new task in Notion (Brain Dump Inbox)
2. Wait up to 15 minutes, or run `syncNotionToTasksLog()` manually
3. Expected: new row appears in `tasks_log` with correct field values

### Test 2 — Updated task
1. Edit any field (e.g., Domain or Status) on an existing Notion task
2. Run `syncNotionToTasksLog()`
3. Expected: matching row updates in-place; no duplicate row

### Test 3 — Completed task
1. Set a founder-only task's Status to "Done" in Notion
2. Set its Completed Date in Notion
3. Run sync
4. Expected: `status` = "Completed", `completed_date` set, founder metrics increase in `validateMetrics()`

### Test 4 — Formula integrity
1. Run `syncNotionToTasksLog()`
2. Check cols M and N in `tasks_log` — they should show calculated values, not zeros or blanks for rows with effort + cognitive_load
3. Run `validateMetrics()` — should pass without formula issues

### Test 5 — Summaries
1. Run `generateDailyCapacitySummary()`
2. Run `generateWeeklyCapacitySummary()`
3. Expected: both print formatted output to the Execution Log with real values, SGR as decimal

---

## Failure Conditions

| Symptom | Likely cause | Fix |
|---|---|---|
| `NOTION_API_KEY or NOTION_DATABASE_ID not set` | Properties not stored | Re-run `setProperties()` with correct values |
| `Notion API error 401` | API key invalid or revoked | Regenerate key at notion.so/my-integrations |
| `Notion API error 404` | Database ID wrong or integration not connected to database | Check database ID; re-share database with integration |
| Duplicate rows | task_id column A has blank cells or was manually edited | Run `repairFormulas()`, then check col A for blanks |
| SGR shows as 53% | Cell formatted as percent | Format SGR cell as Number, 2 decimal places |
| Metrics = 0 after sync | Formula error or column mismatch | Run `validateMetrics()` — will log specifics and auto-repair formulas |
| Sync trigger missing | Never ran `createTimeTrigger()` or it was deleted | Re-run `createTimeTrigger()` |

---

## sync_log Tab

Every sync run is logged automatically to a hidden `sync_log` tab:

| Column | Content |
|---|---|
| timestamp | ISO datetime of the run |
| status | OK or ERROR |
| message | Updated/inserted counts or error message |

To view it: right-click any sheet tab → Show sheets → sync_log, or run this in the editor:
```js
SpreadsheetApp.getActiveSpreadsheet().getSheetByName('sync_log').showSheet();
```

---

## SGR Decision Rules

| SGR Value | Status | Meaning |
|---|---|---|
| ≥ 1.15 | GREEN | Completing faster than creating — capacity healthy |
| 1.0 – 1.14 | YELLOW | Breaking even — watch the backlog |
| < 1.0 | RED | Creating faster than completing — backlog pressure increasing |

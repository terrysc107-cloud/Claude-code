/**
 * Capacity Intelligence Sync
 * Notion (Brain Dump Inbox) → Google Sheets (tasks_log)
 *
 * Notion database: Brain Dump Inbox
 * Collection ID: 05218dbf-6ac0-48ff-9b52-098c79013100
 *
 * Column layout in tasks_log:
 *   A=task_id  B=task_name  C=domain  D=assignee  E=delegated
 *   F=effort   G=cognitive_load  H=founder_only  I=repeatable
 *   J=status   K=created_date  L=completed_date
 *   M=capacity_spent (formula)  N=delegation_value (formula)
 *
 * Deploy steps:
 *   1. Paste this file into Apps Script editor (Extensions → Apps Script)
 *   2. Run setProperties() once to store NOTION_API_KEY + NOTION_DATABASE_ID
 *   3. Run ensureHeaders() once
 *   4. Run syncNotionToTasksLog() to test
 *   5. Run createTimeTrigger() once to install 15-min auto-sync
 */

// ─── CONFIG ─────────────────────────────────────────────────────────────────

function getConfig() {
  const p = PropertiesService.getScriptProperties();
  return {
    notionApiKey:      p.getProperty('NOTION_API_KEY')      || '',
    notionDatabaseId:  p.getProperty('NOTION_DATABASE_ID')  || '',
    tasksLogName:      p.getProperty('TASKS_LOG_SHEET_NAME') || 'tasks_log',
    metricsName:       p.getProperty('METRICS_SHEET_NAME')   || 'metrics',
    dashboardName:     p.getProperty('DASHBOARD_SHEET_NAME') || 'dashboard',
    weeklyLogName:     p.getProperty('WEEKLY_LOG_SHEET_NAME')|| 'weekly_log',
  };
}

/**
 * Run once to store secrets. Replace placeholder values before running.
 * After running, delete or comment out the key values for safety.
 */
function setProperties() {
  PropertiesService.getScriptProperties().setProperties({
    NOTION_API_KEY:        'secret_REPLACE_ME',
    NOTION_DATABASE_ID:    'REPLACE_WITH_DATABASE_UUID',
    TASKS_LOG_SHEET_NAME:  'tasks_log',
    METRICS_SHEET_NAME:    'metrics',
    DASHBOARD_SHEET_NAME:  'dashboard',
    WEEKLY_LOG_SHEET_NAME: 'weekly_log',
  });
  Logger.log('Properties saved.');
}

// ─── NOTION API ──────────────────────────────────────────────────────────────

/**
 * Fetch all pages from the Notion database, handling pagination.
 * Returns an array of raw Notion page objects.
 */
function fetchNotionTasks() {
  const cfg = getConfig();
  if (!cfg.notionApiKey || !cfg.notionDatabaseId) {
    throw new Error('NOTION_API_KEY or NOTION_DATABASE_ID not set in PropertiesService.');
  }

  const url = 'https://api.notion.com/v1/databases/' + cfg.notionDatabaseId + '/query';
  const headers = {
    'Authorization':  'Bearer ' + cfg.notionApiKey,
    'Notion-Version': '2022-06-28',
    'Content-Type':   'application/json',
  };

  let allPages = [];
  let hasMore  = true;
  let cursor   = null;

  while (hasMore) {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const response = UrlFetchApp.fetch(url, {
      method:      'post',
      headers:     headers,
      payload:     JSON.stringify(body),
      muteHttpExceptions: true,
    });

    const statusCode = response.getResponseCode();
    if (statusCode !== 200) {
      const err = JSON.parse(response.getContentText());
      throw new Error('Notion API error ' + statusCode + ': ' + (err.message || response.getContentText()));
    }

    const data = JSON.parse(response.getContentText());
    allPages = allPages.concat(data.results || []);
    hasMore  = data.has_more || false;
    cursor   = data.next_cursor || null;
  }

  return allPages;
}

// ─── NORMALIZATION ───────────────────────────────────────────────────────────

/**
 * Map a raw Notion page → flat row object matching tasks_log columns.
 * Status normalization: Notion "Done" → Sheet "Completed"
 */
function normalizeNotionTask(page) {
  const props = page.properties || {};

  return {
    task_id:        extractTaskId(page),
    task_name:      extractTitle(props['Item']),
    domain:         extractSelect(props['Domain']),
    assignee:       extractPeople(props['Assignee']),
    delegated:      extractCheckbox(props['Delegated']),
    effort:         extractNumber(props['Effort (hrs)']),
    cognitive_load: extractNumber(props['Cognitive Load']),
    founder_only:   extractCheckbox(props['Founder Only']),
    repeatable:     extractCheckbox(props['Repeatable']),
    status:         normalizeStatus(extractSelect(props['Status'])),
    created_date:   extractCreatedTime(page),
    completed_date: extractDate(props['Completed Date']),
  };
}

function extractTaskId(page) {
  // Notion page IDs are already UUIDs; return as-is (with dashes)
  return page.id || '';
}

function extractTitle(prop) {
  if (!prop || !prop.title || !prop.title.length) return '';
  return prop.title.map(function(t) { return t.plain_text || ''; }).join('');
}

function extractSelect(prop) {
  if (!prop || !prop.select) return '';
  return prop.select.name || '';
}

function extractCheckbox(prop) {
  if (!prop) return false;
  // Notion REST API returns actual booleans for checkbox, not __YES__/__NO__
  return prop.checkbox === true;
}

function extractNumber(prop) {
  if (!prop || prop.number === null || prop.number === undefined) return '';
  return prop.number;
}

function extractPeople(prop) {
  if (!prop || !prop.people || !prop.people.length) return '';
  return prop.people
    .map(function(p) {
      return (p.name) || (p.person && p.person.email) || '';
    })
    .filter(Boolean)
    .join(', ');
}

function extractDate(prop) {
  if (!prop || !prop.date || !prop.date.start) return '';
  return prop.date.start.substring(0, 10); // YYYY-MM-DD
}

function extractCreatedTime(page) {
  if (!page.created_time) return '';
  return page.created_time.substring(0, 10); // YYYY-MM-DD
}

function normalizeStatus(raw) {
  if (!raw) return '';
  if (raw === 'Done') return 'Completed';
  return raw; // Inbox, Triage, Planned, Dropped pass through
}

// ─── SHEET OPERATIONS ────────────────────────────────────────────────────────

const HEADERS = [
  'task_id', 'task_name', 'domain', 'assignee', 'delegated',
  'effort', 'cognitive_load', 'founder_only', 'repeatable', 'status',
  'created_date', 'completed_date', 'capacity_spent', 'delegation_value',
];

/**
 * Write header row if row 1 col A is empty.
 * Safe to call on a sheet with existing data.
 */
function ensureHeaders(sheet) {
  if (!sheet) {
    const cfg = getConfig();
    sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.tasksLogName);
  }
  const firstCell = sheet.getRange(1, 1).getValue();
  if (firstCell === '' || firstCell === null) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    Logger.log('Headers written.');
  } else {
    Logger.log('Headers already present: ' + firstCell);
  }
}

/**
 * Build a map of { task_id → rowNumber } from column A (skipping header row 1).
 */
function getExistingTaskIndexMap(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const map = {};
  ids.forEach(function(row, i) {
    const id = row[0];
    if (id) map[String(id)] = i + 2; // +2 because row 1 is header
  });
  return map;
}

/**
 * Capacity Spent formula adapted to actual column letters.
 * F=effort(6), G=cognitive_load(7), H=founder_only(8)
 */
function capacitySpentFormula(rowNum) {
  return '=IF(OR(F' + rowNum + '="",G' + rowNum + '=""),"",F' + rowNum +
         '*G' + rowNum + '*IF(H' + rowNum + '=TRUE,1.5,1))';
}

/**
 * Delegation Value formula.
 * E=delegated(5), F=effort(6)
 */
function delegationValueFormula(rowNum) {
  return '=IF(F' + rowNum + '="","",IF(E' + rowNum + '=TRUE,F' + rowNum + '*0.6,0))';
}

/**
 * Convert a normalized task object to an array matching the 14-column layout.
 * Cols M and N are placeholder strings replaced with formulas after writing.
 */
function taskToRow(task) {
  return [
    task.task_id,
    task.task_name,
    task.domain,
    task.assignee,
    task.delegated,       // boolean
    task.effort,
    task.cognitive_load,
    task.founder_only,    // boolean
    task.repeatable,      // boolean
    task.status,
    task.created_date,
    task.completed_date,
    '',  // capacity_spent  — formula set separately
    '',  // delegation_value — formula set separately
  ];
}

/**
 * Upsert all tasks into tasks_log.
 * - Existing task_id → update that row
 * - New task_id → append row
 * Formulas in cols M and N are always (re)written to keep them canonical.
 */
function upsertTasksToSheet(tasks) {
  const cfg   = getConfig();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(cfg.tasksLogName);
  if (!sheet) throw new Error('Sheet not found: ' + cfg.tasksLogName);

  ensureHeaders(sheet);
  const indexMap = getExistingTaskIndexMap(sheet);

  let updated = 0;
  let inserted = 0;

  tasks.forEach(function(task) {
    if (!task.task_id) return;

    const row = taskToRow(task);

    if (indexMap.hasOwnProperty(task.task_id)) {
      // Update existing row
      const rowNum = indexMap[task.task_id];
      sheet.getRange(rowNum, 1, 1, 14).setValues([row]);
      sheet.getRange(rowNum, 13).setFormula(capacitySpentFormula(rowNum));
      sheet.getRange(rowNum, 14).setFormula(delegationValueFormula(rowNum));
      updated++;
    } else {
      // Append new row
      sheet.appendRow(row);
      const newRow = sheet.getLastRow();
      sheet.getRange(newRow, 13).setFormula(capacitySpentFormula(newRow));
      sheet.getRange(newRow, 14).setFormula(delegationValueFormula(newRow));
      indexMap[task.task_id] = newRow; // prevent duplicate inserts in same run
      inserted++;
    }
  });

  Logger.log('Sync complete. Updated: ' + updated + ', Inserted: ' + inserted);
  return { updated: updated, inserted: inserted };
}

/**
 * Re-apply canonical formulas to every data row in tasks_log.
 * Call this if validateMetrics() finds broken formula output.
 */
function repairFormulas(sheet) {
  if (!sheet) {
    const cfg = getConfig();
    sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.tasksLogName);
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  for (var r = 2; r <= lastRow; r++) {
    sheet.getRange(r, 13).setFormula(capacitySpentFormula(r));
    sheet.getRange(r, 14).setFormula(delegationValueFormula(r));
  }
  Logger.log('Formulas repaired for rows 2–' + lastRow);
}

// ─── MAIN SYNC ───────────────────────────────────────────────────────────────

/**
 * Primary entry point. Called by time trigger and can be run manually.
 */
function syncNotionToTasksLog() {
  const start = new Date();
  try {
    const pages  = fetchNotionTasks();
    const tasks  = pages.map(normalizeNotionTask);
    const result = upsertTasksToSheet(tasks);
    const msg    = 'Updated: ' + result.updated + ', Inserted: ' + result.inserted +
                   ', Total fetched: ' + pages.length;
    logSyncRun('OK', msg);
    Logger.log('syncNotionToTasksLog OK — ' + msg);
  } catch (e) {
    logSyncRun('ERROR', e.message);
    Logger.log('syncNotionToTasksLog ERROR: ' + e.message);
    throw e;
  }
}

// ─── VALIDATION ──────────────────────────────────────────────────────────────

/**
 * Check that metric outputs exist and are non-zero (where data warrants).
 * Logs issues found. Returns array of issue strings (empty = all good).
 */
function validateMetrics() {
  const cfg    = getConfig();
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const tSheet = ss.getSheetByName(cfg.tasksLogName);
  const mSheet = ss.getSheetByName(cfg.metricsName);

  const issues = [];

  if (!tSheet) { issues.push('tasks_log sheet not found'); return issues; }

  const lastRow = tSheet.getLastRow();
  if (lastRow < 2) { issues.push('tasks_log has no data rows'); return issues; }

  // Check formulas in col M and N are present for all data rows
  let brokenFormulas = 0;
  for (var r = 2; r <= Math.min(lastRow, 20); r++) {
    const mVal = tSheet.getRange(r, 13).getFormula();
    const nVal = tSheet.getRange(r, 14).getFormula();
    if (!mVal) brokenFormulas++;
    if (!nVal) brokenFormulas++;
  }
  if (brokenFormulas > 0) {
    issues.push('Broken formulas detected in cols M/N (' + brokenFormulas + ' missing). Run repairFormulas().');
    repairFormulas(tSheet);
  }

  // Validate computed data from tasks_log directly
  const data    = tSheet.getRange(2, 1, lastRow - 1, 14).getValues();
  const totLogs = data.length;
  const totCompleted = data.filter(function(r) { return r[9] === 'Completed'; }).length;
  const totBacklog   = data.filter(function(r) { return r[9] !== 'Completed'; }).length;
  const totCapacity  = data.reduce(function(s, r) { return s + (Number(r[12]) || 0); }, 0);
  const totDelegVal  = data.reduce(function(s, r) { return s + (Number(r[13]) || 0); }, 0);

  Logger.log('=== Metrics Validation ===');
  Logger.log('Total Tasks Logged:    ' + totLogs);
  Logger.log('Tasks Completed:       ' + totCompleted);
  Logger.log('Tasks in Backlog:      ' + totBacklog);
  Logger.log('Total Capacity Spent:  ' + totCapacity.toFixed(2));
  Logger.log('Total Delegation Value:' + totDelegVal.toFixed(2));

  if (totCompleted === 0 && totLogs > 5) {
    issues.push('Tasks Completed = 0 but ' + totLogs + ' tasks exist. Check status normalization.');
  }
  if (totCapacity === 0 && totLogs > 5) {
    issues.push('Total Capacity Spent = 0. Check effort/cognitive_load columns or formula integrity.');
  }

  if (mSheet) {
    // Spot-check metrics sheet for non-empty output cells
    // Assumes metrics sheet has labeled cells — we check first 30 rows col B for numeric values
    const mData = mSheet.getRange(1, 1, Math.min(mSheet.getLastRow(), 30), 2).getValues();
    const emptyMetrics = mData.filter(function(r) { return r[0] !== '' && r[1] === ''; });
    if (emptyMetrics.length > 3) {
      issues.push('Metrics sheet has ' + emptyMetrics.length + ' labeled but empty cells. Formulas may need repair.');
    }
  }

  if (issues.length === 0) {
    Logger.log('Validation passed — no issues found.');
  } else {
    Logger.log('Validation issues: ' + issues.join(' | '));
  }

  return issues;
}

// ─── SGR COMPUTATION ─────────────────────────────────────────────────────────

/**
 * Compute SGR from tasks_log data.
 * SGR = completed_last_7_days / MAX(1, created_last_7_days)
 * Returns a decimal ratio (e.g., 1.25), not a percent.
 */
function computeSGR(data) {
  const now     = new Date();
  const cutoff  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cutStr  = cutoff.toISOString().substring(0, 10);

  const created   = data.filter(function(r) { return r[10] >= cutStr && r[10] !== ''; }).length;
  const completed = data.filter(function(r) {
    return r[9] === 'Completed' && r[11] >= cutStr && r[11] !== '';
  }).length;

  return completed / Math.max(1, created);
}

/**
 * Return the domain with highest total capacity_spent among active (non-Completed) tasks.
 */
function topPressureDomain(data) {
  const domainLoad = {};
  data.forEach(function(r) {
    if (r[9] === 'Completed') return;
    const domain = r[2] || 'Unknown';
    const cap    = Number(r[12]) || 0;
    domainLoad[domain] = (domainLoad[domain] || 0) + cap;
  });
  let topDomain = '—';
  let topLoad   = 0;
  Object.keys(domainLoad).forEach(function(d) {
    if (domainLoad[d] > topLoad) { topLoad = domainLoad[d]; topDomain = d; }
  });
  return topDomain;
}

// ─── SUMMARIES ───────────────────────────────────────────────────────────────

/**
 * Generate daily capacity summary from live tasks_log values.
 * Logs output and returns the formatted string.
 */
function generateDailyCapacitySummary() {
  const cfg    = getConfig();
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const sheet  = ss.getSheetByName(cfg.tasksLogName);
  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log('No data in tasks_log.');
    return '';
  }

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
  const sgr  = computeSGR(data);
  const sgrFormatted = sgr.toFixed(2);

  const status = sgr >= 1.15 ? 'GREEN' : sgr >= 1.0 ? 'YELLOW' : 'RED';

  // Backlog delta: created last 7 days - completed last 7 days
  const now    = new Date();
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cutStr = cutoff.toISOString().substring(0, 10);
  const createdRecent   = data.filter(function(r) { return r[10] >= cutStr && r[10] !== ''; }).length;
  const completedRecent = data.filter(function(r) {
    return r[9] === 'Completed' && r[11] >= cutStr && r[11] !== '';
  }).length;
  const backlogDelta = createdRecent - completedRecent;

  const topDomain = topPressureDomain(data);

  // TODAY'S MOVES: top active tasks by capacity_spent
  const activeTasks = data.filter(function(r) { return r[9] !== 'Completed'; })
    .sort(function(a, b) { return (Number(b[12]) || 0) - (Number(a[12]) || 0); });

  const delegateTask = activeTasks.find(function(r) { return r[4] === true; });
  const deferTask    = activeTasks.find(function(r) { return r[4] !== true && r[7] !== true; });
  const focusTask    = activeTasks.find(function(r) { return r[7] === true; });

  const summary = [
    'CAPACITY STATUS: ' + status,
    'SGR: ' + sgrFormatted,
    'BACKLOG DELTA: ' + backlogDelta,
    'TOP PRESSURE DOMAIN: ' + topDomain,
    "TODAY'S MOVES:",
    '1. Delegate: ' + (delegateTask ? delegateTask[1] : '—'),
    '2. Defer: '    + (deferTask    ? deferTask[1]    : '—'),
    '3. Focus: '    + (focusTask    ? focusTask[1]    : '—'),
  ].join('\n');

  Logger.log('\n' + summary);
  return summary;
}

/**
 * Generate weekly capacity review from live tasks_log values.
 * Logs output and returns the formatted string.
 */
function generateWeeklyCapacitySummary() {
  const cfg   = getConfig();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(cfg.tasksLogName);
  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log('No data in tasks_log.');
    return '';
  }

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
  const sgr  = computeSGR(data);
  const sgrFormatted = sgr.toFixed(2);

  const now    = new Date();
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cutStr = cutoff.toISOString().substring(0, 10);

  const createdRecent   = data.filter(function(r) { return r[10] >= cutStr && r[10] !== ''; }).length;
  const completedRecent = data.filter(function(r) {
    return r[9] === 'Completed' && r[11] >= cutStr && r[11] !== '';
  }).length;
  const netPressure = createdRecent - completedRecent;

  const topDomain = topPressureDomain(data);

  // Founder bottleneck: active founder-only tasks
  const founderBottleneck = data.filter(function(r) {
    return r[9] !== 'Completed' && r[7] === true;
  }).length;

  // Repeatable tasks done by founder this week
  const repeatableFounderDone = data.filter(function(r) {
    return r[9] === 'Completed' &&
           r[7] === true &&        // founder_only (col H, index 7)
           r[8] === true &&        // repeatable (col I, index 8)
           r[11] >= cutStr && r[11] !== '';
  }).length;

  // Recommended move
  let recommendedMove;
  if (founderBottleneck > 5) {
    recommendedMove = 'delegate';
  } else if (repeatableFounderDone > 3) {
    recommendedMove = 'automate';
  } else if (netPressure > 5) {
    recommendedMove = 'cut scope';
  } else {
    recommendedMove = 'deploy capacity';
  }

  const summary = [
    'WEEKLY CAPACITY REVIEW',
    'SGR: ' + sgrFormatted,
    'NET PRESSURE: ' + netPressure,
    'TOP PRESSURE DOMAIN: ' + topDomain,
    'FOUNDER BOTTLENECK: ' + founderBottleneck + ' active founder-only tasks',
    'REPEATABLE TASKS DONE BY FOUNDER: ' + repeatableFounderDone,
    'RECOMMENDED MOVE: ' + recommendedMove,
  ].join('\n');

  Logger.log('\n' + summary);
  return summary;
}

// ─── OPTIONAL FUNCTIONS ──────────────────────────────────────────────────────

/**
 * Append a weekly snapshot row to the weekly_log tab.
 * Run manually or via weekly trigger.
 */
function appendWeeklySnapshot() {
  const cfg   = getConfig();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const tSheet = ss.getSheetByName(cfg.tasksLogName);
  let   wSheet = ss.getSheetByName(cfg.weeklyLogName);

  if (!wSheet) {
    wSheet = ss.insertSheet(cfg.weeklyLogName);
    wSheet.appendRow(['week_ending', 'sgr', 'net_pressure', 'top_domain',
                      'founder_bottleneck', 'repeatable_founder_done',
                      'total_completed', 'total_capacity_spent']);
  }

  if (!tSheet || tSheet.getLastRow() < 2) return;

  const data = tSheet.getRange(2, 1, tSheet.getLastRow() - 1, 14).getValues();
  const sgr  = computeSGR(data);
  const now  = new Date();
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cutStr = cutoff.toISOString().substring(0, 10);
  const today  = now.toISOString().substring(0, 10);

  const createdRecent   = data.filter(function(r) { return r[10] >= cutStr; }).length;
  const completedRecent = data.filter(function(r) {
    return r[9] === 'Completed' && r[11] >= cutStr;
  }).length;
  const netPressure = createdRecent - completedRecent;
  const topDomain   = topPressureDomain(data);
  const founderBot  = data.filter(function(r) { return r[9] !== 'Completed' && r[7] === true; }).length;
  const repeatDone  = data.filter(function(r) {
    return r[9] === 'Completed' && r[7] === true && r[8] === true && r[11] >= cutStr;
  }).length;
  const totCompleted = data.filter(function(r) { return r[9] === 'Completed'; }).length;
  const totCapacity  = data.reduce(function(s, r) { return s + (Number(r[12]) || 0); }, 0);

  wSheet.appendRow([today, sgr.toFixed(2), netPressure, topDomain,
                    founderBot, repeatDone, totCompleted, totCapacity.toFixed(2)]);
  Logger.log('Weekly snapshot appended for ' + today);
}

/**
 * Record each sync run. Writes to a hidden log tab (creates if missing).
 */
function logSyncRun(status, message) {
  try {
    const ss     = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName('sync_log');
    if (!logSheet) {
      logSheet = ss.insertSheet('sync_log');
      logSheet.appendRow(['timestamp', 'status', 'message']);
      logSheet.hideSheet();
    }
    logSheet.appendRow([new Date().toISOString(), status, message]);
    // Keep only last 100 log rows to avoid bloat
    const rows = logSheet.getLastRow();
    if (rows > 101) {
      logSheet.deleteRows(2, rows - 101);
    }
  } catch (e) {
    Logger.log('logSyncRun failed: ' + e.message);
  }
}

// ─── TRIGGER MANAGEMENT ──────────────────────────────────────────────────────

/**
 * Install a 15-minute time-based trigger for syncNotionToTasksLog.
 * Run once. Check Triggers panel (clock icon) in Apps Script editor to confirm.
 */
function createTimeTrigger() {
  // Remove any existing triggers for this function to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'syncNotionToTasksLog') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('syncNotionToTasksLog')
    .timeBased()
    .everyMinutes(15)
    .create();

  Logger.log('15-minute trigger installed for syncNotionToTasksLog.');
}

/**
 * Remove all triggers for syncNotionToTasksLog (use to pause sync).
 */
function removeSyncTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'syncNotionToTasksLog') {
      ScriptApp.deleteTrigger(t);
    }
  });
  Logger.log('Sync trigger removed.');
}

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const STATE_KEY = 'liteZen.isHidden';
const SAVED_ACTIVITY_BAR_LOCATION = 'liteZen.savedActivityBarLocation';
const SAVED_STATUS_BAR_VISIBLE = 'liteZen.savedStatusBarVisible';
const SAVED_PANEL_VISIBLE = 'liteZen.savedPanelVisible';

/** Delay (ms) after closing/opening panels to let VS Code re-layout */
const PANEL_DETECT_DELAY_MS = 100;
/** Number of lines in the temporary document used for panel detection */
const TEMP_DOC_LINE_COUNT = 100;
/** Minimum visible lines required for the heuristic to be reliable */
const MIN_VISIBLE_LINES = 3;
/** Minimum line-count difference that indicates the panel was visible */
const PANEL_DIFF_THRESHOLD = 2;

let logFilePath: string|undefined;
let loggingEnabled = false;

function log(msg: string): void {
  if (!loggingEnabled) {
    return;
  }
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, line);
    } catch {
      // ignore write errors
    }
  }
}

function logEditorState(label: string): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    log(`${label}: no activeTextEditor`);
    return;
  }
  const doc = editor.document;
  const ranges = editor.visibleRanges;
  const rangesStr = ranges
                        .map(
                            r => `[${r.start.line}:${r.start.character}-${
                                r.end.line}:${r.end.character}]`)
                        .join(', ');
  let totalLines = 0;
  for (const r of ranges) {
    totalLines += r.end.line - r.start.line;
  }
  log(`${label}: file=${doc.fileName}, totalLines=${
      doc.lineCount}, visibleRanges=[${rangesStr}], totalVisibleLines=${
      totalLines}`);
}

interface FocusConfig {
  hideSidebar: boolean;
  hidePanel: boolean;
  hideActivityBar: boolean;
  hideStatusBar: boolean;
  hideAuxiliaryBar: boolean;
  restoreSidebar: boolean;
  restorePanel: boolean;
  restoreAuxiliaryBar: boolean;
}

function getConfig(): FocusConfig {
  const cfg = vscode.workspace.getConfiguration('liteZen');
  return {
    hideSidebar: cfg.get('hideSidebar', true),
    hidePanel: cfg.get('hidePanel', true),
    hideActivityBar: cfg.get('hideActivityBar', false),
    hideStatusBar: cfg.get('hideStatusBar', false),
    hideAuxiliaryBar: cfg.get('hideAuxiliaryBar', true),
    restoreSidebar: cfg.get('restoreSidebar', true),
    restorePanel: cfg.get('restorePanel', true),
    restoreAuxiliaryBar: cfg.get('restoreAuxiliaryBar', true),
  };
}

async function setFocusContext(value: boolean): Promise<void> {
  await vscode.commands.executeCommand('setContext', 'liteZen.isHidden', value);
}

function getEditorVisibleLineCount(): number|undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.visibleRanges.length === 0) {
    return undefined;
  }
  let total = 0;
  for (const range of editor.visibleRanges) {
    total += range.end.line - range.start.line;
  }
  return total;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function detectPanelVisible(): Promise<boolean|undefined> {
  const method = vscode.workspace.getConfiguration('liteZen').get<string>(
      'panelDetectionMethod', 'auto');

  const result = await detectPanelVisibleHeuristic();
  if (result !== undefined) {
    // Heuristic succeeded (panel is already closed by heuristic)
    return result;
  }

  if (method === 'tempDocument') {
    // Heuristic was unreliable — panel is NOT yet closed.
    // Fall back to tempDocument which does its own close/measure cycle.
    log('heuristic returned undefined, falling back to tempDocument');
    return detectPanelVisibleTempDoc();
  }

  // auto mode: heuristic unreliable, close panel and return undefined
  await vscode.commands.executeCommand('workbench.action.closePanel');
  return undefined;
}

async function detectPanelVisibleTempDoc(): Promise<boolean|undefined> {
  log('--- detectPanelVisibleTempDoc START ---');
  const originalEditor = vscode.window.activeTextEditor;

  // Create a temporary document long enough to guarantee a measurable diff
  const content = Array(TEMP_DOC_LINE_COUNT).fill('.').join('\n');
  const doc = await vscode.workspace.openTextDocument({content});
  const editor = await vscode.window.showTextDocument(
      doc, {preview: true, preserveFocus: false});
  await delay(PANEL_DETECT_DELAY_MS);

  logEditorState('TEMPDOC after open');
  const linesBefore = getEditorVisibleLineCount();
  log(`tempDoc linesBefore = ${linesBefore}`);

  if (linesBefore === undefined) {
    log('tempDoc: linesBefore undefined → cleanup → returning undefined');
    await vscode.commands.executeCommand(
        'workbench.action.revertAndCloseActiveEditor');
    if (originalEditor) {
      await vscode.window.showTextDocument(originalEditor.document, {
        viewColumn: originalEditor.viewColumn,
        preserveFocus: false,
      });
    }
    return undefined;
  }

  await vscode.commands.executeCommand('workbench.action.closePanel');
  await delay(PANEL_DETECT_DELAY_MS);

  logEditorState('TEMPDOC after closePanel');
  const linesAfter = getEditorVisibleLineCount();
  log(`tempDoc linesAfter = ${linesAfter}`);

  // Clean up: close the temp document without save prompt
  await vscode.commands.executeCommand(
      'workbench.action.revertAndCloseActiveEditor');

  // Restore original editor if there was one
  if (originalEditor) {
    await vscode.window.showTextDocument(originalEditor.document, {
      viewColumn: originalEditor.viewColumn,
      preserveFocus: false,
    });
  }

  if (linesAfter === undefined) {
    log('tempDoc: linesAfter undefined → returning undefined');
    return undefined;
  }

  const diff = linesAfter - linesBefore;
  const wasPanelVisible = diff > PANEL_DIFF_THRESHOLD;
  log(`tempDoc: diff = ${diff}, wasPanelVisible = ${wasPanelVisible}`);
  log('--- detectPanelVisibleTempDoc END ---');
  return wasPanelVisible;
}

async function detectPanelVisibleHeuristic(): Promise<boolean|undefined> {
  log('--- detectPanelVisible START ---');
  logEditorState('BEFORE closePanel');

  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.visibleRanges.length === 0) {
    log('no activeTextEditor or no visibleRanges → returning undefined');
    return undefined;
  }

  const totalDocLines = editor.document.lineCount;
  const linesBefore = getEditorVisibleLineCount();
  log(`linesBefore = ${linesBefore}, totalDocLines = ${totalDocLines}`);

  if (linesBefore === undefined || linesBefore < MIN_VISIBLE_LINES) {
    log(`linesBefore too small or undefined → returning undefined`);
    return undefined;
  }

  // If the end of the file is already visible, closing the panel won't
  // reliably add visible lines — VS Code may just add empty space below
  // instead of scrolling up, so the heuristic is unreliable.
  const lastRange = editor.visibleRanges[editor.visibleRanges.length - 1];
  if (lastRange.end.line >= totalDocLines - 1) {
    log(`end of file visible (lastRange.end.line=${
        lastRange.end.line}, totalDocLines=${
        totalDocLines}) → heuristic unreliable → returning undefined`);
    return undefined;
  }

  log('executing workbench.action.closePanel...');
  await vscode.commands.executeCommand('workbench.action.closePanel');
  log(`closePanel done, waiting ${PANEL_DETECT_DELAY_MS}ms...`);
  await delay(PANEL_DETECT_DELAY_MS);

  logEditorState('AFTER closePanel + delay');
  const linesAfter = getEditorVisibleLineCount();
  log(`linesAfter = ${linesAfter}`);
  if (linesAfter === undefined) {
    log('linesAfter is undefined → returning undefined');
    return undefined;
  }

  const diff = linesAfter - linesBefore;
  const wasPanelVisible = diff > PANEL_DIFF_THRESHOLD;
  log(`diff = ${diff} (${linesAfter} - ${linesBefore}), wasPanelVisible = ${
      wasPanelVisible}`);

  // Panel is already closed after measurement — no need to re-open.
  // hidePanels will skip closing it again.

  log(`--- detectPanelVisible END → ${wasPanelVisible} ---`);
  return wasPanelVisible;
}

async function hidePanels(context: vscode.ExtensionContext): Promise<void> {
  log('=== hidePanels START ===');
  const config = getConfig();
  log(`config: ${JSON.stringify(config)}`);
  const wbConfig = vscode.workspace.getConfiguration('workbench');

  // Save current state before hiding
  if (config.hideActivityBar) {
    const currentLocation =
        wbConfig.get<string>('activityBar.location', 'default');
    log(`saving activityBar.location = ${currentLocation}`);
    await context.workspaceState.update(
        SAVED_ACTIVITY_BAR_LOCATION, currentLocation);
  }

  if (config.hideStatusBar) {
    const currentVisible = wbConfig.get<boolean>('statusBar.visible', true);
    log(`saving statusBar.visible = ${currentVisible}`);
    await context.workspaceState.update(
        SAVED_STATUS_BAR_VISIBLE, currentVisible);
  }

  if (config.hidePanel) {
    log('detecting panel visibility...');
    const panelVisible = await detectPanelVisible();
    log(`panelVisible detected = ${panelVisible}, saving to workspaceState`);
    await context.workspaceState.update(SAVED_PANEL_VISIBLE, panelVisible);
  }

  // Execute close commands
  const commands: Thenable<void>[] = [];

  if (config.hideSidebar) {
    commands.push(
        vscode.commands.executeCommand('workbench.action.closeSidebar'));
  }
  // Panel is already closed by detectPanelVisible above — no need to close
  // again.
  if (config.hideAuxiliaryBar) {
    commands.push(
        vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar'));
  }

  await Promise.all(commands);

  // Update settings for activity bar and status bar
  if (config.hideActivityBar) {
    await wbConfig.update(
        'activityBar.location', 'hidden', vscode.ConfigurationTarget.Global);
  }
  if (config.hideStatusBar) {
    await wbConfig.update(
        'statusBar.visible', false, vscode.ConfigurationTarget.Global);
  }

  await context.workspaceState.update(STATE_KEY, true);
  await setFocusContext(true);
  log('=== hidePanels END ===');
}

async function showPanels(context: vscode.ExtensionContext): Promise<void> {
  log('=== showPanels START ===');
  const config = getConfig();
  log(`config: ${JSON.stringify(config)}`);
  const wbConfig = vscode.workspace.getConfiguration('workbench');

  // Restore activity bar
  if (config.hideActivityBar) {
    const savedLocation = context.workspaceState.get<string>(
        SAVED_ACTIVITY_BAR_LOCATION, 'default');
    const current = wbConfig.get<string>('activityBar.location');
    log(`activityBar: saved=${savedLocation}, current=${current}`);
    if (current === 'hidden') {
      await wbConfig.update(
          'activityBar.location', savedLocation,
          vscode.ConfigurationTarget.Global);
    }
  }

  // Restore status bar
  if (config.hideStatusBar) {
    const savedVisible =
        context.workspaceState.get<boolean>(SAVED_STATUS_BAR_VISIBLE, true);
    const current = wbConfig.get<boolean>('statusBar.visible');
    log(`statusBar: saved=${savedVisible}, current=${current}`);
    if (current === false) {
      await wbConfig.update(
          'statusBar.visible', savedVisible, vscode.ConfigurationTarget.Global);
    }
  }

  // Restore panels via toggle commands (only if configured)
  const commands: Thenable<void>[] = [];

  if (config.hideSidebar && config.restoreSidebar) {
    commands.push(vscode.commands.executeCommand(
        'workbench.action.toggleSidebarVisibility'));
  }
  if (config.hidePanel && config.restorePanel) {
    const savedPanelVisible =
        context.workspaceState.get<boolean|undefined>(SAVED_PANEL_VISIBLE);
    log(`panel restore: savedPanelVisible=${savedPanelVisible} (type=${
        typeof savedPanelVisible}), restorePanel=${config.restorePanel}`);
    if (savedPanelVisible !== false) {
      log('panel restore: will execute togglePanel (savedPanelVisible is true or undefined)');
      commands.push(
          vscode.commands.executeCommand('workbench.action.togglePanel'));
    } else {
      log(`panel restore: SKIPPED — savedPanelVisible is false`);
    }
  }
  if (config.hideAuxiliaryBar && config.restoreAuxiliaryBar) {
    commands.push(
        vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar'));
  }

  await Promise.all(commands);

  await context.workspaceState.update(STATE_KEY, false);
  await setFocusContext(false);
  log('=== showPanels END ===');
}

export function activate(context: vscode.ExtensionContext): void {
  // Set up logging
  loggingEnabled =
      vscode.workspace.getConfiguration('liteZen').get('enableLogging', false);
  const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  logFilePath = wsFolder ? path.join(wsFolder, 'log.txt') :
                           path.join(os.homedir(), 'lite-zen-log.txt');
  if (loggingEnabled) {
    try {
      fs.writeFileSync(logFilePath, '');
    } catch { /* ignore */
    }
  }
  log(`Lite Zen activated, logFile=${logFilePath}`);

  // React to config changes
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('liteZen.enableLogging')) {
      loggingEnabled = vscode.workspace.getConfiguration('liteZen').get(
          'enableLogging', false);
      if (loggingEnabled) {
        log('Logging enabled');
      }
    }
  }));

  // Restore context key from persisted state on activation
  const wasHidden = context.workspaceState.get<boolean>(STATE_KEY, false);
  log(`activation: wasHidden=${wasHidden}`);
  setFocusContext(wasHidden);

  let isToggling = false;
  const toggleDisposable =
      vscode.commands.registerCommand('liteZen.toggle', async () => {
        if (isToggling) {
          return;
        }
        isToggling = true;
        try {
          const isHidden =
              context.workspaceState.get<boolean>(STATE_KEY, false);
          log(`toggle: isHidden=${isHidden}`);
          if (isHidden) {
            await showPanels(context);
          } else {
            await hidePanels(context);
          }
        } finally {
          isToggling = false;
        }
      });

  const showDisposable =
      vscode.commands.registerCommand('liteZen.show', async () => {
        const isHidden = context.workspaceState.get<boolean>(STATE_KEY, false);
        if (isHidden) {
          await showPanels(context);
        }
      });

  context.subscriptions.push(toggleDisposable, showDisposable);
}

export function deactivate(): void {
  // nothing to clean up
}

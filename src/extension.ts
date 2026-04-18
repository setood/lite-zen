import * as vscode from 'vscode';

const STATE_KEY = 'codeFocus.isHidden';
const SAVED_ACTIVITY_BAR_LOCATION = 'codeFocus.savedActivityBarLocation';
const SAVED_STATUS_BAR_VISIBLE = 'codeFocus.savedStatusBarVisible';

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
  const cfg = vscode.workspace.getConfiguration('codeFocus');
  return {
    hideSidebar: cfg.get('hideSidebar', true),
    hidePanel: cfg.get('hidePanel', true),
    hideActivityBar: cfg.get('hideActivityBar', true),
    hideStatusBar: cfg.get('hideStatusBar', true),
    hideAuxiliaryBar: cfg.get('hideAuxiliaryBar', true),
    restoreSidebar: cfg.get('restoreSidebar', true),
    restorePanel: cfg.get('restorePanel', true),
    restoreAuxiliaryBar: cfg.get('restoreAuxiliaryBar', true),
  };
}

async function setFocusContext(value: boolean): Promise<void> {
  await vscode.commands.executeCommand(
      'setContext', 'codeFocus.isHidden', value);
}

async function hidePanels(context: vscode.ExtensionContext): Promise<void> {
  const config = getConfig();
  const wbConfig = vscode.workspace.getConfiguration('workbench');

  // Save current state before hiding
  if (config.hideActivityBar) {
    const currentLocation =
        wbConfig.get<string>('activityBar.location', 'default');
    await context.workspaceState.update(
        SAVED_ACTIVITY_BAR_LOCATION, currentLocation);
  }

  if (config.hideStatusBar) {
    const currentVisible = wbConfig.get<boolean>('statusBar.visible', true);
    await context.workspaceState.update(
        SAVED_STATUS_BAR_VISIBLE, currentVisible);
  }

  // Execute close commands
  const commands: Thenable<void>[] = [];

  if (config.hideSidebar) {
    commands.push(
        vscode.commands.executeCommand('workbench.action.closeSidebar'));
  }
  if (config.hidePanel) {
    commands.push(
        vscode.commands.executeCommand('workbench.action.closePanel'));
  }
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
}

async function showPanels(context: vscode.ExtensionContext): Promise<void> {
  const config = getConfig();
  const wbConfig = vscode.workspace.getConfiguration('workbench');

  // Restore activity bar
  if (config.hideActivityBar) {
    const savedLocation = context.workspaceState.get<string>(
        SAVED_ACTIVITY_BAR_LOCATION, 'default');
    const current = wbConfig.get<string>('activityBar.location');
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
    commands.push(
        vscode.commands.executeCommand('workbench.action.togglePanel'));
  }
  if (config.hideAuxiliaryBar && config.restoreAuxiliaryBar) {
    commands.push(
        vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar'));
  }

  await Promise.all(commands);

  await context.workspaceState.update(STATE_KEY, false);
  await setFocusContext(false);
}

export function activate(context: vscode.ExtensionContext): void {
  // Restore context key from persisted state on activation
  const wasHidden = context.workspaceState.get<boolean>(STATE_KEY, false);
  setFocusContext(wasHidden);

  const toggleDisposable =
      vscode.commands.registerCommand('codeFocus.toggle', async () => {
        const isHidden = context.workspaceState.get<boolean>(STATE_KEY, false);
        if (isHidden) {
          await showPanels(context);
        } else {
          await hidePanels(context);
        }
      });

  const showDisposable =
      vscode.commands.registerCommand('codeFocus.show', async () => {
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

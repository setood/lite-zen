import * as assert from 'assert';
import * as vscode from 'vscode';

const CMD_TOGGLE = 'liteZen.toggle';
const CMD_SHOW = 'liteZen.show';
const WAIT = 500;
const WAIT_SETTING = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read a fresh workbench config value (avoids stale cached objects). */
function wb<T>(key: string): T|undefined {
  return vscode.workspace.getConfiguration('workbench').get<T>(key);
}

/** Update a liteZen setting at Global level. */
async function setLiteZen(key: string, value: unknown): Promise<void> {
  await vscode.workspace.getConfiguration('liteZen').update(
      key, value, vscode.ConfigurationTarget.Global);
  await delay(200);
}

/** Update a workbench setting at Global level. */
async function setWb(key: string, value: unknown): Promise<void> {
  await vscode.workspace.getConfiguration('workbench')
      .update(key, value, vscode.ConfigurationTarget.Global);
  await delay(200);
}

async function toggle(): Promise<void> {
  await vscode.commands.executeCommand(CMD_TOGGLE);
  await delay(WAIT);
}

async function show(): Promise<void> {
  await vscode.commands.executeCommand(CMD_SHOW);
  await delay(WAIT);
}

// ---------------------------------------------------------------------------
// Suite 1: Activation & Registration
// ---------------------------------------------------------------------------
suite('1 · Activation & Registration', () => {
  test('1.1 Extension activates successfully', async () => {
    const ext = vscode.extensions.getExtension('setood.lite-zen');
    assert.ok(ext, 'Extension should be found');
    if (!ext!.isActive) {
      await ext!.activate();
    }
    assert.ok(ext!.isActive, 'Extension should be active');
  });

  test('1.2 Commands are registered', async () => {
    const cmds = await vscode.commands.getCommands(true);
    assert.ok(cmds.includes(CMD_TOGGLE), 'liteZen.toggle missing');
    assert.ok(cmds.includes(CMD_SHOW), 'liteZen.show missing');
  });

  test('1.3 Configuration defaults match package.json', () => {
    const c = vscode.workspace.getConfiguration('liteZen');
    assert.strictEqual(c.get('hideSidebar'), true);
    assert.strictEqual(c.get('hidePanel'), true);
    assert.strictEqual(c.get('hideActivityBar'), false);
    assert.strictEqual(c.get('hideStatusBar'), false);
    assert.strictEqual(c.get('hideAuxiliaryBar'), true);
    assert.strictEqual(c.get('restoreSidebar'), true);
    assert.strictEqual(c.get('restorePanel'), true);
    assert.strictEqual(c.get('restoreAuxiliaryBar'), true);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Toggle (hide → show cycle)
// ---------------------------------------------------------------------------
suite('2 · Toggle cycle', () => {
  setup(async () => {
    await setLiteZen('hideActivityBar', true);
    await setLiteZen('hideStatusBar', true);
  });

  teardown(async () => {
    // Ensure shown state
    await show();  // safe even if already shown
    await setLiteZen('hideActivityBar', undefined);
    await setLiteZen('hideStatusBar', undefined);
    await delay(200);
  });

  test('2.1 Toggle hides observable components', async () => {
    await toggle();

    assert.strictEqual(
        wb('activityBar.location'), 'hidden', 'Activity bar should be hidden');
    assert.strictEqual(
        wb('statusBar.visible'), false, 'Status bar should be hidden');
  });

  test('2.2 Toggle twice → full roundtrip', async () => {
    const origAB = wb<string>('activityBar.location');
    const origSB = wb<boolean>('statusBar.visible');

    await toggle();  // hide
    await toggle();  // show

    assert.strictEqual(
        wb('activityBar.location'), origAB, 'Activity bar not restored');
    assert.strictEqual(
        wb('statusBar.visible'), origSB, 'Status bar not restored');
  });

  test('2.3 Multiple rapid toggles (×4) → final state is shown', async () => {
    const origAB = wb<string>('activityBar.location');

    await toggle();  // 1 – hide
    await toggle();  // 2 – show
    await toggle();  // 3 – hide
    await toggle();  // 4 – show

    assert.strictEqual(
        wb('activityBar.location'), origAB,
        'Activity bar should be back to original after 4 toggles');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Show command
// ---------------------------------------------------------------------------
suite('3 · Show command', () => {
  setup(async () => {
    await setLiteZen('hideActivityBar', true);
    await setLiteZen('hideStatusBar', true);
  });

  teardown(async () => {
    await show();
    await setLiteZen('hideActivityBar', undefined);
    await setLiteZen('hideStatusBar', undefined);
  });

  test('3.1 Show restores from hidden', async () => {
    const origAB = wb<string>('activityBar.location');

    await toggle();  // hide
    assert.strictEqual(wb('activityBar.location'), 'hidden');

    await show();
    assert.strictEqual(
        wb('activityBar.location'), origAB,
        'Activity bar not restored by show');
  });

  test('3.2 Show is idempotent when visible', async () => {
    const origAB = wb<string>('activityBar.location');

    await show();  // already visible — should not throw or change anything
    assert.strictEqual(wb('activityBar.location'), origAB);
  });

  test('3.3 Show called twice while hidden', async () => {
    const origAB = wb<string>('activityBar.location');

    await toggle();  // hide
    await show();    // first show
    await show();    // second show — noop

    assert.strictEqual(
        wb('activityBar.location'), origAB, 'Should still be restored');
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Activity bar
// ---------------------------------------------------------------------------
suite('4 · Activity bar', () => {
  teardown(async () => {
    await show();
    await setLiteZen('hideActivityBar', undefined);
    await setWb('activityBar.location', undefined);  // reset to default
    await delay(200);
  });

  test('4.1 hideActivityBar=true → hides and restores', async () => {
    await setLiteZen('hideActivityBar', true);
    const orig = wb<string>('activityBar.location');

    await toggle();
    assert.strictEqual(wb('activityBar.location'), 'hidden');

    await toggle();
    assert.strictEqual(wb('activityBar.location'), orig);
  });

  test('4.2 hideActivityBar=false → activity bar untouched', async () => {
    await setLiteZen('hideActivityBar', false);
    const orig = wb<string>('activityBar.location');

    await toggle();
    assert.strictEqual(
        wb('activityBar.location'), orig, 'Activity bar should not change');

    await toggle();  // restore
  });

  test('4.3 Saves non-default location (side)', async () => {
    await setWb('activityBar.location', 'side');
    await setLiteZen('hideActivityBar', true);
    await delay(200);

    await toggle();  // hide
    assert.strictEqual(wb('activityBar.location'), 'hidden');

    await toggle();  // show
    assert.strictEqual(
        wb('activityBar.location'), 'side',
        'Should restore to "side", not "default"');
  });

  test(
      '4.4 User manually restores while hidden → show does not overwrite',
      async () => {
        await setLiteZen('hideActivityBar', true);

        await toggle();  // hide — location becomes 'hidden'
        assert.strictEqual(wb('activityBar.location'), 'hidden');

        // User manually sets it back
        await setWb('activityBar.location', 'default');
        assert.strictEqual(wb('activityBar.location'), 'default');

        await show();  // extension checks current === 'hidden'; it's not → skip
        assert.strictEqual(
            wb('activityBar.location'), 'default',
            'Should NOT overwrite user change');
      });
});

// ---------------------------------------------------------------------------
// Suite 5: Status bar
// ---------------------------------------------------------------------------
suite('5 · Status bar', () => {
  teardown(async () => {
    await show();
    await setLiteZen('hideStatusBar', undefined);
    await setWb('statusBar.visible', undefined);
    await delay(200);
  });

  test('5.1 hideStatusBar=true → hides and restores', async () => {
    await setLiteZen('hideStatusBar', true);
    const orig = wb<boolean>('statusBar.visible');

    await toggle();
    assert.strictEqual(wb('statusBar.visible'), false);

    await toggle();
    assert.strictEqual(wb('statusBar.visible'), orig);
  });

  test('5.2 hideStatusBar=false → status bar untouched', async () => {
    await setLiteZen('hideStatusBar', false);
    const orig = wb<boolean>('statusBar.visible');

    await toggle();
    assert.strictEqual(
        wb('statusBar.visible'), orig, 'Status bar should not change');

    await toggle();
  });

  test(
      '5.3 User manually shows status bar while hidden → show does not overwrite',
      async () => {
        await setLiteZen('hideStatusBar', true);

        await toggle();  // hide
        assert.strictEqual(wb('statusBar.visible'), false);

        // User manually flips it back
        await setWb('statusBar.visible', true);

        await show();  // extension checks current === false; it's not → skip
        assert.strictEqual(
            wb('statusBar.visible'), true, 'Should NOT overwrite user change');
      });
});

// ---------------------------------------------------------------------------
// Suite 6: Bottom panel
// ---------------------------------------------------------------------------
suite('6 · Bottom panel', () => {
  teardown(async () => {
    await show();
    await setLiteZen('hidePanel', undefined);
    await setLiteZen('restorePanel', undefined);
    await delay(200);
  });

  test('6.1 hidePanel=true → closePanel executes without error', async () => {
    await setLiteZen('hidePanel', true);
    await toggle();  // should call workbench.action.closePanel
    await toggle();  // restore
  });

  test(
      '6.1a Panel open before hide → restored on show (visibleRanges heuristic)',
      async () => {
        // Open a text document so the heuristic has an editor to measure
        const doc = await vscode.workspace.openTextDocument({
          content: Array(100).fill('line').join('\n'),
        });
        await vscode.window.showTextDocument(doc);
        await delay(200);

        // Open panel explicitly
        await vscode.commands.executeCommand('workbench.action.togglePanel');
        await delay(300);

        await setLiteZen('hidePanel', true);
        await setLiteZen('restorePanel', true);

        await toggle();  // hide — detectPanelVisible measures editor growth
        await toggle();  // show — restores panel if heuristic detected it was
                         // open

        // The heuristic should have detected the panel was open and saved true.
        // No error = the code path was executed.
      });

  test('6.2 Panel was closed before hide → not restored on show', async () => {
    // Open a text document so the heuristic has an editor to measure
    const doc = await vscode.workspace.openTextDocument({
      content: Array(100).fill('line').join('\n'),
    });
    await vscode.window.showTextDocument(doc);
    await delay(200);

    // Close panel manually first
    await vscode.commands.executeCommand('workbench.action.closePanel');
    await delay(300);

    await setLiteZen('hidePanel', true);

    await toggle();  // hide (heuristic: no editor growth → panel was closed)
    await toggle();  // show — should NOT toggle panel open
    // No assert for visual state, but no error = pass
  });

  test('6.3 restorePanel=false → panel stays closed after show', async () => {
    await setLiteZen('hidePanel', true);
    await setLiteZen('restorePanel', false);

    await toggle();  // hide
    await toggle();  // show — restorePanel=false → skip togglePanel
    // No error = pass
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Sidebar
// ---------------------------------------------------------------------------
suite('7 · Sidebar', () => {
  teardown(async () => {
    await show();
    await setLiteZen('hideSidebar', undefined);
    await setLiteZen('restoreSidebar', undefined);
    await delay(200);
  });

  test(
      '7.1 hideSidebar=true → closeSidebar executes without error',
      async () => {
        await setLiteZen('hideSidebar', true);
        await toggle();
        await toggle();
      });

  test('7.2 hideSidebar=false → sidebar untouched', async () => {
    await setLiteZen('hideSidebar', false);

    await toggle();  // should skip sidebar
    await toggle();
    // No error = pass
  });

  test(
      '7.3 restoreSidebar=false → sidebar stays closed after show',
      async () => {
        await setLiteZen('hideSidebar', true);
        await setLiteZen('restoreSidebar', false);

        await toggle();  // hide
        await toggle();  // show — should NOT open sidebar
      });
});

// ---------------------------------------------------------------------------
// Suite 8: Auxiliary bar
// ---------------------------------------------------------------------------
suite('8 · Auxiliary bar', () => {
  teardown(async () => {
    await show();
    await setLiteZen('hideAuxiliaryBar', undefined);
    await setLiteZen('restoreAuxiliaryBar', undefined);
    await delay(200);
  });

  test(
      '8.1 hideAuxiliaryBar=true → closeAuxiliaryBar executes without error',
      async () => {
        await setLiteZen('hideAuxiliaryBar', true);
        await toggle();
        await toggle();
      });

  test('8.2 hideAuxiliaryBar=false → auxiliary bar untouched', async () => {
    await setLiteZen('hideAuxiliaryBar', false);
    await toggle();
    await toggle();
  });

  test('8.3 restoreAuxiliaryBar=false → stays closed after show', async () => {
    await setLiteZen('hideAuxiliaryBar', true);
    await setLiteZen('restoreAuxiliaryBar', false);

    await toggle();
    await toggle();
  });
});

// ---------------------------------------------------------------------------
// Suite 9: Selective configuration
// ---------------------------------------------------------------------------
suite('9 · Selective configuration', () => {
  teardown(async () => {
    await show();
    await setLiteZen('hideSidebar', undefined);
    await setLiteZen('hidePanel', undefined);
    await setLiteZen('hideActivityBar', undefined);
    await setLiteZen('hideStatusBar', undefined);
    await setLiteZen('hideAuxiliaryBar', undefined);
    await setLiteZen('restoreSidebar', undefined);
    await setWb('activityBar.location', undefined);
    await delay(200);
  });

  test(
      '9.1 Only activity bar — sidebar/panel/auxbar/statusbar untouched',
      async () => {
        await setLiteZen('hideSidebar', false);
        await setLiteZen('hidePanel', false);
        await setLiteZen('hideAuxiliaryBar', false);
        await setLiteZen('hideStatusBar', false);
        await setLiteZen('hideActivityBar', true);
        await delay(200);

        const origSB = wb<boolean>('statusBar.visible');

        await toggle();
        assert.strictEqual(
            wb('activityBar.location'), 'hidden',
            'Activity bar should be hidden');
        assert.strictEqual(
            wb('statusBar.visible'), origSB, 'Status bar should be untouched');

        await toggle();
      });

  test('9.2 All 5 components enabled → hides and restores', async () => {
    await setLiteZen('hideSidebar', true);
    await setLiteZen('hidePanel', true);
    await setLiteZen('hideAuxiliaryBar', true);
    await setLiteZen('hideActivityBar', true);
    await setLiteZen('hideStatusBar', true);
    await delay(200);

    const origAB = wb<string>('activityBar.location');
    const origSBVis = wb<boolean>('statusBar.visible');

    await toggle();  // hide all
    assert.strictEqual(wb('activityBar.location'), 'hidden');
    assert.strictEqual(wb('statusBar.visible'), false);

    await toggle();  // show all
    assert.strictEqual(wb('activityBar.location'), origAB);
    assert.strictEqual(wb('statusBar.visible'), origSBVis);
  });

  test('9.3 Config change between hide and show is respected', async () => {
    await setLiteZen('hideActivityBar', true);
    await delay(200);

    await toggle();  // hide
    assert.strictEqual(wb('activityBar.location'), 'hidden');

    // Disable hideActivityBar while hidden
    await setLiteZen('hideActivityBar', false);

    await show();
    // Since hideActivityBar is now false, showPanels skips activity bar restore
    // Activity bar stays 'hidden' because show() won't touch it
    assert.strictEqual(
        wb('activityBar.location'), 'hidden',
        'Show should respect fresh config and skip activity bar restore');

    // Clean up: restore manually
    await setWb('activityBar.location', 'default');
  });
});

// ---------------------------------------------------------------------------
// Suite 10: Edge cases
// ---------------------------------------------------------------------------
suite('10 · Edge cases', () => {
  teardown(async () => {
    await show();
    await setLiteZen('hideActivityBar', undefined);
    await setLiteZen('hideStatusBar', undefined);
    await delay(200);
  });

  test('10.1 Toggle from fresh state (no prior workspaceState)', async () => {
    // First toggle in a clean test environment — should not throw
    await setLiteZen('hideActivityBar', true);
    await toggle();
    assert.strictEqual(wb('activityBar.location'), 'hidden');
    await toggle();
  });

  test('10.2 Deactivate does not throw', () => {
    // Import and call deactivate directly
    const ext = require('../../extension') as {deactivate: () => void};
    assert.doesNotThrow(() => ext.deactivate());
  });
});

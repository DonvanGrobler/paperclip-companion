import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { errorCases } from '../fixtures/chat-errors';

async function withChat(
  work: (app: ElectronApplication, chat: Page, overlay: Page) => Promise<void>,
  entry = '.',
) {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'paperclip-stream-'));
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      args: [entry, `--user-data-dir=${profile}`],
    });
    const overlay = await app.firstWindow();
    const opened = app.waitForEvent('window');
    await overlay
      .getByRole('button', { name: 'Open chat', exact: true })
      .click();
    const chat = await opened;
    await expect(chat.getByLabel('Your message')).toBeVisible();
    await work(app, chat, overlay);
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
}
const send = async (chat: Page) => {
  await chat.getByLabel('Your message').fill('Synthetic streaming question');
  await chat.getByLabel('Your message').press('Enter');
};
const ready = async (chat: Page) => {
  await expect(
    chat.getByText('Sample reply ready.', { exact: true }),
  ).toBeVisible();
  await expect(chat.locator('.sample p')).toHaveText(
    'A pivot table summarizes grouped data.',
  );
};

test('streams partial text, stops, retries fresh and clears active work', async () => {
  await withChat(async (_app, chat) => {
    await expect(
      chat.getByText(
        'Provider: Offline mock · Text only · No account connected',
      ),
    ).toBeVisible();
    await send(chat);
    await expect(chat.locator('.sample p')).toHaveText('A pivot table ');
    await chat.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(
      chat.getByText('Stopped. Nothing was sent to an external service.'),
    ).toBeVisible();
    await expect(chat.locator('.sample p')).toHaveText('A pivot table ');
    await chat.getByRole('button', { name: 'Retry', exact: true }).click();
    await ready(chat);
    await send(chat);
    await expect(chat.locator('.sample p')).toHaveText('A pivot table ');
    await chat.getByRole('button', { name: 'Clear conversation' }).click();
    await expect(chat.locator('.sample')).toHaveCount(0);
    await send(chat);
    await ready(chat); // A fresh reply, never doubled by the cancelled generation.
  });
});

test('shows every scripted failure and retries only on explicit user action', async () => {
  await withChat(async (_app, chat) => {
    for (const [scenario, message] of [
      ['error', 'Simulated offline error'],
      ['auth', 'Simulated expired sign-in'],
      ['rate', 'Simulated rate limit'],
      ['vision', 'cannot read images'],
      ['cancel', 'Stopped. Nothing was sent to an external service.'],
    ]) {
      await chat.getByLabel('Preview scenario').selectOption(scenario!);
      await send(chat);
      await expect(chat.locator('.chat-status')).toContainText(message!);
      await expect(
        chat.getByRole('button', { name: 'Stop', exact: true }),
      ).toBeDisabled();
      await expect(
        chat.getByRole('button', { name: 'Retry', exact: true }),
      ).toBeEnabled();
      await chat.getByLabel('Preview scenario').selectOption('reply');
      await chat.getByRole('button', { name: 'Retry', exact: true }).click();
      await ready(chat);
    }
  });
});

test('denies overlay and malformed IPC; cancels on reload and close with clean reopen', async () => {
  await withChat(async (app, chat, overlay) => {
    expect(
      await overlay.evaluate(async () => [
        await window.companionWindow.chatStart({
          run: 1,
          prompt: 'denied',
          scenario: 'reply',
        }),
        await window.companionWindow.chatNext(1),
        await window.companionWindow.chatCancel(1),
      ]),
    ).toEqual([false, null, false]);
    expect(
      await chat.evaluate(async () => {
        const start = window.companionWindow.chatStart as (
          value: unknown,
        ) => Promise<boolean>;
        return Promise.all([
          start({
            run: 1,
            prompt: 'image',
            scenario: 'reply',
            screenshot: { bytes: [1] },
          }),
          start({ run: 1, prompt: 'x'.repeat(2001), scenario: 'reply' }),
          start({
            run: 1,
            prompt: 'denied consent',
            scenario: 'reply',
            consentGranted: true,
          }),
          start({
            run: 1,
            prompt: 'endpoint',
            scenario: 'reply',
            endpoint: 'https://example.com',
          }),
        ]);
      }),
    ).toEqual([false, false, false, false]);
    await send(chat);
    await expect(chat.locator('.sample p')).toHaveText('A pivot table ');
    await chat.reload();
    await expect(chat.locator('.sample')).toHaveCount(0);
    await expect(chat.getByLabel('Your message')).toHaveValue('');
    await send(chat);
    await ready(chat);
    await send(chat);
    await expect(chat.locator('.sample p')).toHaveText('A pivot table ');
    const closed = chat.waitForEvent('close');
    await chat.getByRole('button', { name: 'Close chat' }).click();
    await closed;
    const opened = app.waitForEvent('window');
    await overlay.evaluate(() => window.companionWindow.openChat());
    const fresh = await opened;
    await expect(fresh.getByLabel('Your message')).toHaveValue('');
    await send(fresh);
    await ready(fresh);
  });
});

test('every provider error has safe accessible recovery and a real mock retry', async () => {
  // Ten complete error/retry flows; the normal per-operation assertions keep their limits.
  test.setTimeout(60_000);
  await withChat(async (app, chat, overlay) => {
    const control = await app.evaluateHandle(
      () =>
        Reflect.get(globalThis, '__paperclipChatFault') as {
          code: string | null;
          chunks: number;
          starts: number;
          injected: number;
        },
    );
    expect(await control.evaluate((state) => state.starts)).toBe(0);
    let expectedStarts = 0;
    let expectedFaults = 0;
    for (const [code, expected] of Object.entries(errorCases)) {
      await control.evaluate((state, fault) => {
        state.code = fault;
        state.chunks = 0;
      }, code);
      // The fault layer must not accidentally authorize the overlay.
      expect(
        await overlay.evaluate(async () => [
          await window.companionWindow.chatStart({
            run: 1,
            prompt: 'denied',
            scenario: 'reply',
          }),
          await window.companionWindow.chatNext(1),
        ]),
      ).toEqual([false, null]);
      await send(chat);
      const status = chat.locator('.chat-status');
      await expect(status).toHaveText(expected.message);
      await expect(status).toHaveAttribute('role', expected.role);
      await expect(status).toHaveAttribute(
        'aria-live',
        expected.role === 'alert' ? 'assertive' : 'polite',
      );
      await expect(chat.locator('.sample p')).toHaveText('A pivot table ');
      await expect(
        chat.getByRole('button', { name: 'Stop', exact: true }),
      ).toBeDisabled();
      await expect(
        chat.getByRole('button', { name: 'Retry', exact: true }),
      ).toBeEnabled();
      expectedStarts++;
      expectedFaults++;
      // Editing the draft is not permission to retry or start another request.
      await chat.getByLabel('Your message').fill('Unsubmitted synthetic draft');
      expect(
        await control.evaluate((state) => ({
          starts: state.starts,
          injected: state.injected,
        })),
      ).toEqual({ starts: expectedStarts, injected: expectedFaults });
      await chat.getByRole('button', { name: 'Retry', exact: true }).click();
      await ready(chat);
      expectedStarts++;
      expect(
        await control.evaluate((state) => ({
          starts: state.starts,
          injected: state.injected,
          code: state.code,
        })),
      ).toEqual({
        starts: expectedStarts,
        injected: expectedFaults,
        code: null,
      });
      await expect(
        chat.getByRole('button', { name: 'Retry', exact: true }),
      ).toBeDisabled();
      await chat.getByRole('button', { name: 'Clear conversation' }).click();
      await expect(chat.locator('.sample')).toHaveCount(0);
    }
    await control.dispose();
  }, path.resolve('tests/e2e/chat-harness.cjs'));
});

test('screen controls require explicit text-only fallback and Never overrides Include', async () => {
  await withChat(async (app, chat) => {
    const control = await app.evaluateHandle(
      () =>
        Reflect.get(globalThis, '__paperclipChatFault') as { starts: number },
    );
    await chat
      .getByText('Screen context · unavailable in this preview', {
        exact: true,
      })
      .click();
    const include = chat.getByRole('checkbox', {
      name: 'Include screen for next message',
    });
    const never = chat.getByRole('checkbox', {
      name: 'Never include screen in this window',
    });
    await expect(include).toBeDisabled();
    await expect(include).not.toBeChecked();
    const review = chat.getByRole('button', { name: 'Try controls locally' });
    await review.focus();
    await review.press('Enter');
    await expect(include).toBeFocused();
    await include.press('Space');
    await chat.getByLabel('Your message').fill('Synthetic screen question');
    await chat.getByLabel('Your message').press('Enter');
    const confirmation = chat.getByRole('button', {
      name: 'Send text only',
      exact: true,
    });
    await expect(confirmation).toBeFocused();
    expect(await control.evaluate((state) => state.starts)).toBe(0);
    await chat.getByLabel('Your message').fill('Changed synthetic question');
    await expect(confirmation).toHaveCount(0);
    await chat.getByLabel('Your message').press('Enter');
    await chat.getByRole('button', { name: 'Keep editing' }).click();
    await expect(chat.getByLabel('Your message')).toBeFocused();
    expect(await control.evaluate((state) => state.starts)).toBe(0);
    await chat.getByLabel('Your message').press('Enter');
    await confirmation.press('Enter');
    await ready(chat);
    expect(await control.evaluate((state) => state.starts)).toBe(1);
    await expect(
      chat.getByText('No screen attached · text-only preview', { exact: true }),
    ).toBeVisible();
    await expect(include).not.toBeChecked();
    await include.check();
    await never.check();
    await expect(include).not.toBeChecked();
    await expect(include).toBeDisabled();
    await never.uncheck();
    await expect(include).toBeEnabled();
    await expect(include).not.toBeChecked();
    await include.check();
    await chat.getByRole('button', { name: 'Clear conversation' }).click();
    await expect(include).not.toBeChecked();
    await control.dispose();
  }, path.resolve('tests/e2e/chat-harness.cjs'));
});

test('withdrawing preview controls stops work and privacy choices reset on reopen', async () => {
  await withChat(async (app, chat, overlay) => {
    await chat
      .getByText('Screen context · unavailable in this preview', {
        exact: true,
      })
      .click();
    await chat.getByRole('button', { name: 'Try controls locally' }).click();
    await send(chat);
    await expect(chat.locator('.sample p')).toHaveText('A pivot table ');
    await chat.getByRole('button', { name: 'Use text only' }).click();
    await expect(chat.locator('.chat-status')).toHaveText(
      'Stopped. Nothing was sent to an external service.',
    );
    await expect(
      chat.getByRole('button', { name: 'Try controls locally' }),
    ).toBeFocused();
    await expect(
      chat.getByRole('checkbox', { name: 'Include screen for next message' }),
    ).toBeDisabled();
    await chat.getByRole('button', { name: 'Try controls locally' }).click();
    await chat
      .getByRole('checkbox', { name: 'Include screen for next message' })
      .check();
    await chat.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(
      chat.getByRole('checkbox', { name: 'Include screen for next message' }),
    ).not.toBeChecked();
    await expect(chat.locator('.sample p')).toHaveText('A pivot table ');
    await chat
      .getByRole('checkbox', { name: 'Never include screen in this window' })
      .check();
    await expect(chat.locator('.chat-status')).toHaveText(
      'Stopped. Nothing was sent to an external service.',
    );
    await chat.reload();
    await chat
      .getByText('Screen context · unavailable in this preview', {
        exact: true,
      })
      .click();
    await expect(
      chat.getByRole('button', { name: 'Try controls locally' }),
    ).toBeVisible();
    await expect(
      chat.getByRole('checkbox', {
        name: 'Never include screen in this window',
      }),
    ).not.toBeChecked();
    const closed = chat.waitForEvent('close');
    await chat.getByRole('button', { name: 'Close chat' }).click();
    await closed;
    const opened = app.waitForEvent('window');
    await overlay.evaluate(() => window.companionWindow.openChat());
    const fresh = await opened;
    await fresh
      .getByText('Screen context · unavailable in this preview', {
        exact: true,
      })
      .click();
    await expect(
      fresh.getByRole('button', { name: 'Try controls locally' }),
    ).toBeVisible();
    await expect(
      fresh.getByRole('checkbox', {
        name: 'Never include screen in this window',
      }),
    ).not.toBeChecked();
    await expect(
      fresh.getByRole('checkbox', { name: 'Include screen for next message' }),
    ).toBeDisabled();
    await send(fresh);
    await ready(fresh);
  });
});

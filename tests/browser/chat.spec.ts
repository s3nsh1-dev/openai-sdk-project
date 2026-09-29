import { test, expect } from '@playwright/test';
import type { ChatRequest } from '../../src/shared/protocol';
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.continue()
      : route.abort(),
  );
  await page.goto('/');
  await expect(
    page.getByRole('combobox', { name: 'Provider', exact: true }),
  ).toBeEnabled();
});
test('identifies provider service unavailability and recovers only on explicit Retry', async ({
  page,
}, info) => {
  const requests: { requestId: string; provider: string }[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/chat')
      requests.push(request.postDataJSON());
  });
  await page
    .getByRole('combobox', { name: 'Provider', exact: true })
    .selectOption('gemini');
  await page.getByRole('textbox').fill(`[service503] ${info.project.name}`);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('status')).toHaveText('failed');
  await expect(page.locator('.error')).toContainText(
    'temporarily unavailable (HTTP 503)',
  );
  await expect(page.locator('.error')).not.toContainText(
    'Private fixture details',
  );
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: 'Retry last turn' }).click();
  await expect(page.getByRole('status')).toHaveText('completed');
  await expect(page.getByRole('region', { name: 'Chat turn' })).toHaveCount(1);
  expect(requests).toHaveLength(2);
  expect(requests[1].provider).toBe('gemini');
  expect(requests[1].requestId).not.toBe(requests[0].requestId);
});
test('streams safe Markdown, follows up, copies code, and clears history', async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('textbox').fill('Explain const');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('status')).toHaveText('completed');
  await expect(page.locator('.answer')).toContainText(
    'A const binding cannot be reassigned.',
  );
  await expect(page.locator('.answer img')).toHaveCount(0);
  await expect(page.locator('.answer script')).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy code' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('const n = 4;\n');
  await page.screenshot({
    path: `test-results/${info.project.name}-answer.png`,
    fullPage: true,
  });
  await page.getByRole('textbox').fill('Why?');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('status').last()).toHaveText('completed');
  await expect(page.locator('.answer').last()).toContainText(
    'Follow-up received.',
  );
  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(page.getByRole('region', { name: 'Chat turn' })).toHaveCount(0);
  await expect(page.getByRole('textbox')).toBeFocused();
});
test('switches between providers with shared history and resets to Local on new chat', async ({
  page,
}, info) => {
  const sent: ChatRequest[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/chat')) sent.push(request.postDataJSON());
  });
  const selector = page.getByRole('combobox', {
    name: 'Provider',
    exact: true,
  });
  await page.getByLabel('Local thinking').check();
  await page.getByRole('textbox').fill('First local question');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('status')).toHaveText('completed');
  await expect(selector).toBeEnabled();
  await page.getByRole('textbox').fill('Cloud follow-up');
  await selector.selectOption('gemini');
  await expect(page.getByRole('textbox')).toHaveValue('Cloud follow-up');
  expect(sent).toHaveLength(1);
  await expect(
    page.getByText(/completed conversation history to Google/),
  ).toBeVisible();
  await expect(page.getByLabel('Gemini thought summaries')).not.toBeChecked();
  await page.getByLabel('Gemini thought summaries').check();
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('status').last()).toHaveText('completed');
  await selector.selectOption('local');
  await expect(page.getByLabel('Local thinking')).toBeChecked();
  await page.getByRole('textbox').fill('Back to local');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('status').last()).toHaveText('completed');
  const firstAnswer =
    'A const binding cannot be reassigned.\n\n```js\nconst n = 4;\n```\n\n<script>window.hacked=true</script>\n\n![tracking](https://example.com/track.png)';
  expect(
    sent.map(({ provider, thinking, messages }) => ({
      provider,
      thinking,
      messages,
    })),
  ).toEqual([
    {
      provider: 'local',
      thinking: true,
      messages: [{ role: 'user', content: 'First local question' }],
    },
    {
      provider: 'gemini',
      thinking: true,
      messages: [
        { role: 'user', content: 'First local question' },
        { role: 'assistant', content: firstAnswer },
        { role: 'user', content: 'Cloud follow-up' },
      ],
    },
    {
      provider: 'local',
      thinking: true,
      messages: [
        { role: 'user', content: 'First local question' },
        { role: 'assistant', content: firstAnswer },
        { role: 'user', content: 'Cloud follow-up' },
        { role: 'assistant', content: `Follow-up received. ${firstAnswer}` },
        { role: 'user', content: 'Back to local' },
      ],
    },
  ]);
  const turns = page.getByRole('region', { name: 'Chat turn' });
  await expect(turns.nth(0).getByText('Local · qwen3.5:4b')).toBeVisible();
  await expect(
    turns.nth(1).getByText('Gemini · gemini-3.8-flash'),
  ).toBeVisible();
  await expect(turns.nth(2).getByText('Local · qwen3.5:4b')).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-mixed-providers.png`,
    fullPage: true,
  });
  await selector.selectOption('gemini');
  await expect(page.getByLabel('Gemini thought summaries')).toBeChecked();
  expect(sent).toHaveLength(3);
  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(selector).toHaveValue('local');
  await expect(turns).toHaveCount(0);
  await expect(page.getByLabel('Local thinking')).not.toBeChecked();
  await selector.selectOption('gemini');
  await expect(page.getByLabel('Gemini thought summaries')).not.toBeChecked();
});

test('retries an unsuccessful Local question with explicitly selected Gemini', async ({
  page,
}, info) => {
  const sent: ChatRequest[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/chat')) sent.push(request.postDataJSON());
  });
  const question = `[retry] switch-${info.project.name}`;
  const selector = page.getByRole('combobox', {
    name: 'Provider',
    exact: true,
  });
  await page.getByRole('textbox').fill(question);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('status')).toHaveText('failed');
  await expect(selector).toBeEnabled();
  await selector.selectOption('gemini');
  await page.getByRole('button', { name: 'Retry last turn' }).click();
  await expect(page.getByRole('status')).toHaveText('completed');
  expect(sent[1]).toMatchObject({
    provider: 'gemini',
    thinking: false,
    messages: [{ role: 'user', content: question }],
  });
  expect(sent[1].requestId).not.toBe(sent[0].requestId);
  await expect(page.getByRole('region', { name: 'Chat turn' })).toHaveCount(1);
  await expect(page.getByText('An unfinished attempt.')).toHaveCount(0);
  await expect(page.getByText('Gemini · gemini-3.8-flash')).toBeVisible();
});

test('preserves large Gemini history after a Local rejection and explicitly retries with Gemini', async ({
  page,
}) => {
  const selector = page.getByRole('combobox', {
    name: 'Provider',
    exact: true,
  });
  await selector.selectOption('gemini');
  await page.getByRole('textbox').fill('[large-history]');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('status')).toHaveText('completed');
  await selector.selectOption('local');
  await page.getByRole('textbox').fill('Use the reference');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('status').last()).toHaveText('failed');
  await expect(page.getByRole('alert')).toContainText('input budget');
  await expect(page.locator('.answer').first()).toHaveText('x'.repeat(3000));
  await expect(page.getByRole('region', { name: 'Chat turn' })).toHaveCount(2);
  await expect(selector).toBeEnabled();
  await selector.selectOption('gemini');
  await page.getByRole('button', { name: 'Retry last turn' }).click();
  await expect(page.getByRole('status').last()).toHaveText('completed');
  await expect(page.getByRole('region', { name: 'Chat turn' })).toHaveCount(2);
  await expect(
    page.getByText('Use the reference', { exact: true }),
  ).toHaveCount(1);
});
test('stops before output and during output, then retries without duplication', async ({
  page,
}, info) => {
  await page.getByRole('textbox').fill('[waiting]');
  await page.getByRole('textbox').press('Enter');
  await expect(
    page.getByRole('combobox', { name: 'Provider', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Stop response' }).click();
  await expect(page.getByRole('status')).toHaveText('stopped');
  await expect(
    page.getByRole('combobox', { name: 'Provider', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'New chat' }).click();
  await page.getByRole('textbox').fill(`[slow] ${info.project.name}`);
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByText('Partial response stays visible.')).toBeVisible();
  await page.getByRole('button', { name: 'Stop response' }).click();
  await expect(page.getByText('Partial response stays visible.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry last turn' }).click();
  await expect(page.getByRole('status')).toHaveText('completed');
  await expect(page.getByRole('region', { name: 'Chat turn' })).toHaveCount(1);
});
test('marks reasoning-only limits incomplete and keeps the panel collapsible', async ({
  page,
}) => {
  await page.getByLabel('Local thinking').check();
  await page.getByRole('textbox').fill('[length]');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('status')).toHaveText('incomplete');
  await expect(page.locator('details')).not.toHaveAttribute('open', '');
  await page.locator('summary').click();
  await expect(
    page.getByText('A separately supplied thought summary.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry last turn' }),
  ).toBeVisible();
});
test('preserves output after connection loss and supports explicit retry', async ({
  page,
}, info) => {
  await page.getByRole('textbox').fill(`[retry] ${info.project.name}`);
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('status')).toHaveText('failed');
  await expect(page.getByText('An unfinished attempt.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry last turn' }).click();
  await expect(page.getByRole('status')).toHaveText('completed');
  await page.getByRole('button', { name: 'New chat' }).click();
  await page.getByRole('textbox').fill('[disconnect]');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('status')).toHaveText('failed');
  await expect(page.getByText('Partial response stays visible.')).toBeVisible();
});
test('supports Shift+Enter and IME composition without accidental submission', async ({
  page,
}) => {
  const input = page.getByRole('textbox');
  await input.fill('line one');
  await input.press('Shift+Enter');
  await input.press('l');
  await expect(input).toHaveValue('line one\nl');
  await input.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    isComposing: true,
    keyCode: 229,
  });
  await expect(page.getByRole('region', { name: 'Chat turn' })).toHaveCount(0);
  await input.press('Enter');
  await expect(page.getByRole('status')).toHaveText('completed');
});
test('respects readers scrolling upward and offers Jump to latest', async ({
  page,
}) => {
  await page.getByRole('textbox').fill('[long]');
  await page.getByRole('textbox').press('Enter');
  const log = page.locator('.conversation');
  await expect(page.getByText(/Paragraph 15\./)).toBeAttached();
  await log.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect(
    page.getByRole('button', { name: 'Jump to latest' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('completed');
  expect(await log.evaluate((element) => element.scrollTop)).toBe(0);
  await page.getByRole('textbox').fill('Unsent draft');
  await page
    .getByRole('combobox', { name: 'Provider', exact: true })
    .selectOption('gemini');
  await expect(page.getByRole('textbox')).toHaveValue('Unsent draft');
  expect(await log.evaluate((element) => element.scrollTop)).toBe(0);
  await page.getByRole('button', { name: 'Jump to latest' }).click();
  await expect(
    page.getByRole('button', { name: 'Jump to latest' }),
  ).toHaveCount(0);
  expect(
    await log.evaluate(
      (element) =>
        element.scrollHeight - element.scrollTop - element.clientHeight,
    ),
  ).toBeLessThan(5);
});
test('fits the viewport and shows the empty state', async ({ page }, info) => {
  await expect(
    page.getByRole('heading', { name: 'Your JavaScript practice space.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-empty.png`,
    fullPage: true,
  });
});
test('disables Gemini when the server reports no configured key', async ({
  page,
}) => {
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.providers.gemini.available = false;
    await route.fulfill({ json: config });
  });
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'Provider', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('option[value="gemini"]')).toHaveJSProperty(
    'disabled',
    true,
  );
  const provider = page.getByRole('combobox', {
    name: 'Provider',
    exact: true,
  });
  await provider.focus();
  await provider.press('ArrowDown');
  await expect(
    page.getByRole('combobox', { name: 'Provider', exact: true }),
  ).toHaveValue('local');
});
test('offers Gemini thought summaries and sends the explicit preference', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Provider', exact: true })
    .selectOption('gemini');
  const checkbox = page.getByRole('checkbox', {
    name: 'Gemini thought summaries',
  });
  await expect(checkbox).toBeEnabled();
  await checkbox.check();
  const sent = page.waitForRequest(
    (request) =>
      request.url().endsWith('/api/chat') && request.method() === 'POST',
  );
  await page.getByRole('textbox').fill('Explain a promise');
  await page.getByRole('textbox').press('Enter');
  expect((await sent).postDataJSON()).toMatchObject({
    provider: 'gemini',
    thinking: true,
  });
  await expect(page.getByRole('status')).toHaveText('completed');
  await expect(page.locator('summary')).toHaveText(
    'Reasoning supplied by the model',
  );
  await page.locator('summary').click();
  await expect(
    page.getByText('A Gemini thought summary supplied separately.'),
  ).toBeVisible();
});

test('blocks requests without owner credentials while the authenticated UI works', async ({
  playwright,
  page,
}) => {
  const unauthenticated = await playwright.request.newContext({
    baseURL: 'http://127.0.0.1:4173',
    httpCredentials: undefined,
  });
  try {
    for (const url of ['/', '/api/config']) {
      const response = await unauthenticated.get(url);
      expect(response.status()).toBe(401);
    }
    const generation = await unauthenticated.post('/api/chat', {
      data: {
        requestId: 'unauthenticated-browser',
        provider: 'gemini',
        messages: [{ role: 'user', content: 'Hi' }],
      },
    });
    expect(generation.status()).toBe(401);
    await page.getByRole('textbox').fill('Authenticated browser check');
    await page.getByRole('textbox').press('Enter');
    await expect(page.getByRole('status')).toHaveText('completed');
  } finally {
    await unauthenticated.dispose();
  }
});

test('serves the built page with a restrictive CSP and no inline-script exception', async ({
  page,
}) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy|violates.*directive/i.test(message.text()))
      violations.push(message.text());
  });
  const response = await page.reload();
  expect(response!.headers()['content-security-policy']).toContain(
    "frame-ancestors 'none'",
  );
  expect(response!.headers()['content-security-policy']).not.toMatch(
    /unsafe-inline|unsafe-eval/,
  );
  await page.getByRole('textbox').fill('CSP streaming check');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('status')).toHaveText('completed');
  expect(violations).toEqual([]);
});

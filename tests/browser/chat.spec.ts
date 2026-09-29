import { test, expect } from '@playwright/test';
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
test('locks explicit Gemini selection and resets to Local on new chat', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Provider', exact: true })
    .selectOption('gemini');
  await expect(
    page.getByText(/Messages in this conversation will be sent to Google/),
  ).toBeVisible();
  await page.getByRole('textbox').fill('Cloud fixture');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('status')).toHaveText('completed');
  await expect(
    page.getByRole('combobox', { name: 'Provider', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(
    page.getByRole('combobox', { name: 'Provider', exact: true }),
  ).toHaveValue('local');
});
test('stops before output and during output, then retries without duplication', async ({
  page,
}, info) => {
  await page.getByRole('textbox').fill('[waiting]');
  await page.getByRole('textbox').press('Enter');
  await page.getByRole('button', { name: 'Stop response' }).click();
  await expect(page.getByRole('status')).toHaveText('stopped');
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

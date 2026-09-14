// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { Markdown } from '../src/client/Markdown';
afterEach(cleanup);
it('renders safe Markdown without executable HTML or remote images', () => {
  const { container } = render(
    <Markdown
      text={
        '# Hello\n\n<script>alert(1)</script>\n\n![x](https://example.com/track.png)\n\n[bad](javascript:alert(1))\n\n| A | B |\n| - | - |\n| 1 | 2 |'
      }
    />,
  );
  expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('a')?.getAttribute('href')).not.toMatch(
    /^javascript:/,
  );
  expect(screen.getByRole('table')).toBeInTheDocument();
});
it('copies only code text', async () => {
  const user = userEvent.setup();
  render(<Markdown text={'```js\nconst n = 4;\n```'} />);
  await user.click(screen.getByRole('button', { name: 'Copy code' }));
  expect(await navigator.clipboard.readText()).toBe('const n = 4;\n');
  expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
});

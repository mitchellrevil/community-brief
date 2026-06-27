import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownRenderer } from '@/features/uploads/recording/MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('does not render raw HTML into DOM elements', () => {
    const { container } = render(
      <MarkdownRenderer
        content={`<button data-testid="raw-html" onclick="window.__xss = 1">Owned</button>
<img src="x" alt="xss-image" onerror="window.__xss = 2" />`}
      />
    );

    expect(screen.queryByTestId('raw-html')).not.toBeInTheDocument();
    expect(screen.queryByAltText('xss-image')).not.toBeInTheDocument();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps GFM markdown rendering intact', () => {
    const { container } = render(
      <MarkdownRenderer
        content={`# Analysis

- Item one
- [x] Item two

| Column A | Column B |
| --- | --- |
| Left | Right |

[Reference](https://example.com)`}
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Analysis' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reference' })).toHaveAttribute(
      'href',
      'https://example.com'
    );
    expect(container.querySelector('input[type="checkbox"]')).toBeChecked();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Left')).toBeInTheDocument();
  });
});

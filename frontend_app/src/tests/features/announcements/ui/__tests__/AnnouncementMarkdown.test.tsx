import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AnnouncementMarkdown } from '@/features/announcements/ui/AnnouncementMarkdown';

describe('AnnouncementMarkdown', () => {
  it('does not render raw HTML into DOM elements', () => {
    const { container } = render(
      <AnnouncementMarkdown
        content={`<div data-testid="raw-html">Injected</div>
<a href="javascript:alert(1)" data-testid="raw-link">Bad link</a>`}
      />
    );

    expect(screen.queryByTestId('raw-html')).not.toBeInTheDocument();
    expect(screen.queryByTestId('raw-link')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="raw-html"]')).toBeNull();
    expect(container.querySelector('[data-testid="raw-link"]')).toBeNull();
  });

  it('keeps headings, lists, tables, and links rendering intact', () => {
    render(
      <AnnouncementMarkdown
        content={`## Update

1. Review the change
2. Confirm rollout

| Team | Status |
| --- | --- |
| Web | Ready |

[Read more](https://example.com)`}
      />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Update' })
    ).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read more' })).toHaveAttribute(
      'href',
      'https://example.com'
    );
  });
});

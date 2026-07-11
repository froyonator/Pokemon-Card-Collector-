import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GitHubLink } from './GitHubLink';

describe('GitHubLink', () => {
  it('links to the project GitHub repo, opening in a new tab', () => {
    render(<GitHubLink />);
    const link = screen.getByRole('link', { name: /view this project on github/i });
    expect(link).toHaveAttribute('href', 'https://github.com/froyonator/Pokemon-Card-Collector-');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});

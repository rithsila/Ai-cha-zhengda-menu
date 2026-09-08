import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { saveSession } from './lib/api';

// Mock API calls to prevent unhandled rejections
vi.mock('./lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/api')>();
  return {
    ...actual,
    apiFetch: vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/branches')) return Promise.resolve([]);
      if (url.includes('/api/rewards')) return Promise.resolve([]);
      if (url.includes('/api/staff-accounts')) return Promise.resolve([]);
      if (url.includes('/api/orders')) return Promise.resolve([]);
      if (url.includes('/api/config')) return Promise.resolve({});
      return Promise.resolve([]);
    }),
  };
});

describe('Sidebar Menu & Brand Header', () => {
  beforeEach(() => {
    localStorage.clear();
    saveSession({
      token: 'test-token',
      role: 'manager',
      expiresAt: Date.now() + 3600000,
    });
  });

  it('renders Zhengda mascot logo in sidebar header', () => {
    render(<App />);

    const logo = screen.getByAltText('Zhengda Mascot');
    expect(logo).toBeDefined();
    expect(logo.getAttribute('src')).toBe('/images/zhengda_logo_cropped.webp');
  });

  it('remembers collapsed state for submenus from localStorage', () => {
    localStorage.setItem('staff_rewards_expanded', 'false');
    localStorage.setItem('staff_settings_expanded', 'false');

    render(<App />);

    expect(screen.queryByText('Reward Catalog')).toBeNull();
    expect(screen.queryByText('Lucky Draw Wheel')).toBeNull();
    expect(screen.queryByText('Store')).toBeNull();
  });

  it('toggles rewards submenu and updates localStorage', () => {
    render(<App />);

    // Initially expanded
    expect(screen.getByText('Reward Catalog')).toBeDefined();

    const collapseRewardsBtn = screen.getByLabelText('Collapse rewards');
    fireEvent.click(collapseRewardsBtn);

    // Collapsed
    expect(screen.queryByText('Reward Catalog')).toBeNull();
    expect(localStorage.getItem('staff_rewards_expanded')).toBe('false');

    // Expand again
    const expandRewardsBtn = screen.getByLabelText('Expand rewards');
    fireEvent.click(expandRewardsBtn);

    expect(screen.getByText('Reward Catalog')).toBeDefined();
    expect(localStorage.getItem('staff_rewards_expanded')).toBe('true');
  });

  it('toggles settings submenu and updates localStorage', () => {
    render(<App />);

    // Initially expanded
    expect(screen.getByText('Store')).toBeDefined();

    const collapseSettingsBtn = screen.getByLabelText('Collapse settings');
    fireEvent.click(collapseSettingsBtn);

    // Collapsed
    expect(screen.queryByText('Store')).toBeNull();
    expect(screen.queryByText('Languages')).toBeNull();
    expect(localStorage.getItem('staff_settings_expanded')).toBe('false');
  it('renders Languages subtab in settings submenu and navigates to Languages view', () => {
    render(<App />);

    const languagesBtn = screen.getByRole('button', { name: /languages/i });
    expect(languagesBtn).toBeDefined();

    fireEvent.click(languagesBtn);

    expect(screen.getByRole('heading', { name: 'Languages' })).toBeDefined();
    expect(
      screen.getByText('Manage English, Khmer, and Chinese translations with live preview')
    ).toBeDefined();
  });
});

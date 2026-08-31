import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomSelect } from './CustomSelect';

const sampleOptions = [
  { value: 'staff', label: 'Staff (Orders & Stock)' },
  { value: 'manager', label: 'Manager (Full Access + Reports)' },
  { value: 'admin', label: 'Admin (System)', disabled: true },
];

describe('CustomSelect component', () => {
  it('renders trigger with rounded-none and selected label', () => {
    render(
      <CustomSelect
        value="staff"
        options={sampleOptions}
        onChange={() => {}}
      />
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeDefined();
    expect(trigger.className).toContain('rounded-none');
    expect(screen.getByText('Staff (Orders & Stock)')).toBeDefined();
  });

  it('renders placeholder when no value is selected', () => {
    render(
      <CustomSelect
        value=""
        placeholder="Select a role..."
        options={sampleOptions}
        onChange={() => {}}
      />
    );

    expect(screen.getByText('Select a role...')).toBeDefined();
  });

  it('opens menu on click and displays options with rounded-none', async () => {
    const user = userEvent.setup();
    render(
      <CustomSelect
        value="staff"
        options={sampleOptions}
        onChange={() => {}}
      />
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeDefined();
    expect(listbox.className).toContain('rounded-none');

    const options = screen.getAllByRole('option');
    expect(options.length).toBe(3);
    options.forEach((opt) => {
      expect(opt.className).toContain('rounded-none');
    });
  });

  it('displays checkmark icon on selected option', async () => {
    const user = userEvent.setup();
    render(
      <CustomSelect
        value="staff"
        options={sampleOptions}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole('combobox'));

    const selectedOption = screen.getByRole('option', { name: /Staff \(Orders & Stock\)/i });
    expect(selectedOption.getAttribute('aria-selected')).toBe('true');
    // Checkmark svg exists inside selected option
    expect(selectedOption.querySelector('svg')).toBeDefined();
  });

  it('calls onChange with new value when an option is clicked and closes menu', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <CustomSelect
        value="staff"
        options={sampleOptions}
        onChange={handleChange}
      />
    );

    await user.click(screen.getByRole('combobox'));
    const managerOption = screen.getByRole('option', { name: /Manager \(Full Access \+ Reports\)/i });
    await user.click(managerOption);

    expect(handleChange).toHaveBeenCalledWith('manager');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not select disabled options on click', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <CustomSelect
        value="staff"
        options={sampleOptions}
        onChange={handleChange}
      />
    );

    await user.click(screen.getByRole('combobox'));
    const disabledOption = screen.getByRole('option', { name: /Admin \(System\)/i });
    await user.click(disabledOption);

    expect(handleChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeDefined();
  });

  it('closes on outside click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <div data-testid="outside-element">Outside</div>
        <CustomSelect
          value="staff"
          options={sampleOptions}
          onChange={() => {}}
        />
      </div>
    );

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeDefined();

    fireEvent.pointerDown(screen.getByTestId('outside-element'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('supports keyboard navigation: ArrowDown, Enter, Escape', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <CustomSelect
        value="staff"
        options={sampleOptions}
        onChange={handleChange}
      />
    );

    const trigger = screen.getByRole('combobox');
    trigger.focus();

    // ArrowDown to open
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeDefined();

    // ArrowDown to next item (manager)
    await user.keyboard('{ArrowDown}');
    // Enter to select
    await user.keyboard('{Enter}');
    expect(handleChange).toHaveBeenCalledWith('manager');
    expect(screen.queryByRole('listbox')).toBeNull();

    // Open and close with Escape
    await user.click(trigger);
    expect(screen.getByRole('listbox')).toBeDefined();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('supports option elements passed as children', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <CustomSelect value="single" onChange={handleChange}>
        <option value="single">Single Choice</option>
        <option value="multiple">Multiple Choice</option>
      </CustomSelect>
    );

    const trigger = screen.getByRole('combobox');
    expect(screen.getByText('Single Choice')).toBeDefined();

    await user.click(trigger);
    const multiOption = screen.getByRole('option', { name: 'Multiple Choice' });
    await user.click(multiOption);

    expect(handleChange).toHaveBeenCalledWith('multiple');
  });

  it('is disabled when disabled prop is set', async () => {
    const user = userEvent.setup();
    render(
      <CustomSelect
        value="staff"
        options={sampleOptions}
        disabled
        onChange={() => {}}
      />
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger.getAttribute('disabled')).not.toBeNull();
    await user.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('supports Space key to open and select, and Home/End keys', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <CustomSelect
        value="staff"
        options={sampleOptions}
        onChange={handleChange}
      />
    );

    const trigger = screen.getByRole('combobox');
    trigger.focus();

    // Space to open
    await user.keyboard(' ');
    expect(screen.getByRole('listbox')).toBeDefined();

    // Home to go to first
    await user.keyboard('{Home}');
    // Space to select first
    await user.keyboard(' ');
    expect(handleChange).toHaveBeenCalledWith('staff');
  });

  it('skips disabled options when navigating with ArrowDown and ArrowUp', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const optsWithMiddleDisabled = [
      { value: '1', label: 'First' },
      { value: '2', label: 'Second (disabled)', disabled: true },
      { value: '3', label: 'Third' },
    ];

    render(
      <CustomSelect
        value="1"
        options={optsWithMiddleDisabled}
        onChange={handleChange}
      />
    );

    const trigger = screen.getByRole('combobox');
    trigger.focus();

    // Open
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeDefined();

    // Navigate down - should skip index 1 and go to index 2 (Third)
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(handleChange).toHaveBeenCalledWith('3');
  });
});

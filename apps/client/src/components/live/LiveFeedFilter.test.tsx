/**
 * LiveFeedFilter Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../__tests__/test-utils';
import { LiveFeedFilter } from './LiveFeedFilter';
import type { LiveFeedScope } from '../../types';

describe('LiveFeedFilter', () => {
  const defaultProps = {
    value: 'GLOBAL' as LiveFeedScope,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the select element', () => {
      render(<LiveFeedFilter {...defaultProps} />);

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('should render all scope options', () => {
      render(<LiveFeedFilter {...defaultProps} />);

      expect(screen.getByText('Everyone')).toBeInTheDocument();
      expect(screen.getByText('Friends only')).toBeInTheDocument();
      expect(screen.getByText('My agent')).toBeInTheDocument();
    });

    it('should display current value', () => {
      render(<LiveFeedFilter {...defaultProps} value="FRIENDS" />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('FRIENDS');
    });

    it('should show icon by default', () => {
      const { container } = render(<LiveFeedFilter {...defaultProps} />);

      // Filter icon should be present (hidden on small screens but in DOM)
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should hide icon when showIcon is false', () => {
      const { container } = render(
        <LiveFeedFilter {...defaultProps} showIcon={false} />
      );

      // No Filter icon should be present
      const svg = container.querySelector('svg');
      expect(svg).not.toBeInTheDocument();
    });
  });

  describe('interaction', () => {
    it('should call onChange when selection changes', () => {
      const onChange = vi.fn();
      render(<LiveFeedFilter {...defaultProps} onChange={onChange} />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'FRIENDS' } });

      expect(onChange).toHaveBeenCalledWith('FRIENDS');
    });

    it('should call onChange with MY_AGENT', () => {
      const onChange = vi.fn();
      render(<LiveFeedFilter {...defaultProps} onChange={onChange} />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'MY_AGENT' } });

      expect(onChange).toHaveBeenCalledWith('MY_AGENT');
    });
  });

  describe('accessibility', () => {
    it('should have aria-label', () => {
      render(<LiveFeedFilter {...defaultProps} />);

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-label');
    });
  });

  describe('styling', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <LiveFeedFilter {...defaultProps} className="custom-class" />
      );

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-class');
    });
  });
});

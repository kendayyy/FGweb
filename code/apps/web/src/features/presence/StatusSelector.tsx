import React from 'react';
import { CustomStatus } from '@fg/contracts';
import { CUSTOM_STATUS_LABELS } from './types.js';

interface StatusSelectorProps {
  status: CustomStatus;
  disabled?: boolean;
  isSaving?: boolean;
  error?: string | null;
  onChange: (status: CustomStatus) => void;
  onRetry?: () => void;
}

export function StatusSelector({
  status,
  disabled = false,
  isSaving = false,
  error = null,
  onChange,
  onRetry,
}: StatusSelectorProps) {
  return (
    <div className="fg-status-selector-wrap">
      <label className="fg-status-label">
        <span>Trạng thái của bạn</span>
        <select
          aria-label="Trạng thái"
          value={status}
          disabled={disabled || isSaving}
          onChange={(e) => onChange(e.target.value as CustomStatus)}
          className="fg-status-select"
        >
          <option value="LOOKING_FOR_TEAM">{CUSTOM_STATUS_LABELS.LOOKING_FOR_TEAM}</option>
          <option value="PLAYING">{CUSTOM_STATUS_LABELS.PLAYING}</option>
          <option value="JUST_CHATTING">{CUSTOM_STATUS_LABELS.JUST_CHATTING}</option>
        </select>
      </label>
      {isSaving && <span className="fg-status-saving" role="status">Đang lưu…</span>}
      {error && (
        <div className="fg-status-error" role="alert">
          <span>{error}</span>
          {onRetry && (
            <button
              type="button"
              className="fg-btn-retry-status"
              onClick={onRetry}
            >
              Thử lại
            </button>
          )}
        </div>
      )}
    </div>
  );
}

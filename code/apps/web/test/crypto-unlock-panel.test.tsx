import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeviceUnlockPanel } from '../src/features/crypto/DeviceUnlockPanel';

describe('device unlock controls (DOM unit, no native/auth success claim)', () => {
  it('does not permit a manually chosen low-entropy code for a new device', async () => {
    const user = userEvent.setup(), unlock = vi.fn(async () => undefined);
    render(<DeviceUnlockPanel existingDevice={false} onUnlock={unlock} onCancel={() => undefined}/>);
    const code = screen.getByLabelText('Mã khôi phục') as HTMLInputElement;
    expect(code).toHaveAttribute('readonly');
    await user.type(code, 'A'.repeat(43));
    await user.click(screen.getByRole('checkbox', { name: 'Tôi đã lưu mã ở nơi an toàn' }));
    await user.click(screen.getByRole('button', { name: 'Mở khóa thiết bị' }));
    expect(code.value).toBe(''); expect(unlock).not.toHaveBeenCalled();
  });
  it('requires saving a generated independent code, blocks duplicate unlock, then clears it', async () => {
    const user = userEvent.setup(); let finish!: () => void;
    const unlock = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<DeviceUnlockPanel existingDevice={false} onUnlock={unlock} onCancel={() => undefined}/>);
    await user.click(screen.getByRole('button', { name: 'Tạo mã khôi phục' }));
    const code = screen.getByLabelText('Mã khôi phục') as HTMLInputElement;
    expect(code.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const generated = code.value;
    expect(screen.getByRole('button', { name: 'Mở khóa thiết bị' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Tôi đã lưu mã ở nơi an toàn' }));
    await user.click(screen.getByRole('button', { name: 'Mở khóa thiết bị' }));
    expect(unlock).toHaveBeenCalledExactlyOnceWith(generated);
    expect(screen.getByRole('status')).toHaveTextContent('Đang mở khóa');
    expect(code).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Đang mở khóa…' }));
    expect(unlock).toHaveBeenCalledTimes(1);
    finish(); await waitFor(() => expect(code.value).toBe(''));
  });
  it('existing device requires its exact code until explicit new-device choice and hides raw errors', async () => {
    const user = userEvent.setup();
    const unlock = vi.fn(async () => { throw new Error('private raw diagnostic must never be displayed'); });
    render(<DeviceUnlockPanel existingDevice onUnlock={unlock} onCancel={() => undefined}/>);
    expect(screen.queryByRole('button', { name: 'Tạo mã khôi phục' })).not.toBeInTheDocument();
    const code = screen.getByLabelText('Mã khôi phục');
    expect(code).toHaveAttribute('type', 'password');
    await user.type(code, 'AccountPassword!123');
    expect(screen.getByRole('button', { name: 'Mở khóa thiết bị' })).toBeDisabled();
    await user.clear(code); await user.type(code, 'A'.repeat(43));
    await user.click(screen.getByRole('button', { name: 'Mở khóa thiết bị' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không mở được thiết bị');
    expect(screen.queryByText(/private raw diagnostic/)).not.toBeInTheDocument();
  });
  it('cancel clears the in-memory code while an unlock action is still pending', async () => {
    const user = userEvent.setup(); let finish!: () => void;
    const cancel = vi.fn();
    render(<DeviceUnlockPanel existingDevice onUnlock={() => new Promise<void>(resolve => { finish = resolve; })} onCancel={cancel}/>);
    const code = screen.getByLabelText('Mã khôi phục') as HTMLInputElement;
    await user.type(code, 'A'.repeat(43)); await user.click(screen.getByRole('button', { name: 'Mở khóa thiết bị' }));
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(cancel).toHaveBeenCalledTimes(1); expect(code.value).toBe(''); finish();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
  it('announces the actual other-tab error with a recovery step', () => {
    render(<DeviceUnlockPanel existingDevice errorCode="OTHER_TAB" onUnlock={async () => undefined} onCancel={() => undefined}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('tab khác');
    expect(screen.getByRole('alert')).toHaveTextContent('Đóng');
  });
  it('explicit new-device choice discards the old input and requires a new generated saved code', async () => {
    const user = userEvent.setup(), unlock = vi.fn(async () => undefined);
    render(<DeviceUnlockPanel existingDevice onUnlock={unlock} onCancel={() => undefined}/>);
    const code = screen.getByLabelText('Mã khôi phục') as HTMLInputElement;
    await user.type(code, 'A'.repeat(43));
    await user.click(screen.getByRole('button', { name: 'Tạo thiết bị mới' }));
    expect(code.value).toBe(''); expect(code).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Mở khóa thiết bị' })).toBeDisabled();
    expect(screen.getByText(/Thiết bị mới dùng khóa mới/)).toHaveTextContent('không tự đọc được lịch sử cũ');
    await user.click(screen.getByRole('button', { name: 'Tạo mã khôi phục' }));
    const generated = code.value; expect(generated).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(screen.getByRole('button', { name: 'Mở khóa thiết bị' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Tôi đã lưu mã ở nơi an toàn' }));
    await user.click(screen.getByRole('button', { name: 'Mở khóa thiết bị' }));
    expect(unlock).toHaveBeenCalledExactlyOnceWith(generated, { newDevice: true });
    await waitFor(() => expect(code.value).toBe(''));
  });
  it('returning from a new-device draft clears its code and keeps the original-store input', async () => {
    const user = userEvent.setup(), unlock = vi.fn(async () => undefined);
    render(<DeviceUnlockPanel existingDevice onUnlock={unlock} onCancel={() => undefined}/>);
    await user.click(screen.getByRole('button', { name: 'Tạo thiết bị mới' }));
    await user.click(screen.getByRole('button', { name: 'Tạo mã khôi phục' }));
    await user.click(screen.getByRole('button', { name: 'Quay lại thiết bị đã lưu' }));
    expect(screen.getByLabelText('Mã khôi phục')).toHaveValue('');
    expect(screen.getByLabelText('Mã khôi phục')).not.toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Tạo mã khôi phục' })).not.toBeInTheDocument();
    expect(unlock).not.toHaveBeenCalled();
  });
});

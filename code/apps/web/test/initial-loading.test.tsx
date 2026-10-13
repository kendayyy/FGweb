import React from 'react';
import {act,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {InitialLoading} from '../src/components/ui/InitialLoading.js';

describe('LOADING3D real pending boundary',()=>{
  beforeEach(()=>vi.useFakeTimers());
  afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
  const advance=(ms:number)=>act(()=>vi.advanceTimersByTime(ms));
  it('does not announce a fast request and cancels its timer when ready',()=>{
    const view=render(<InitialLoading pending/>);
    advance(149);expect(screen.queryByRole('status')).toBeNull();
    view.rerender(<InitialLoading pending={false}/>);advance(1000);
    expect(screen.queryByRole('progressbar')).toBeNull();expect(vi.getTimerCount()).toBe(0);
  });
  it('announces slow pending once with an indeterminate progressbar and canonical decorative logo',()=>{
    const view=render(<InitialLoading pending label="Đang tải lịch sử"/>);advance(150);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    const progress=screen.getByRole('progressbar',{name:'Đang tải lịch sử'});
    expect(progress).not.toHaveAttribute('aria-valuenow');expect(progress).not.toHaveAttribute('tabindex');
    expect(view.container.querySelectorAll('svg')).toHaveLength(9);
    expect(view.container.querySelector('svg path')).toHaveAttribute('d','M0 103V24L18 6H89L68 27H21V40H51L31 61H21V84Z');
    advance(6000);expect(screen.getAllByRole('status')).toHaveLength(1);
  });
  it('removes immediately on error/cancel, retries with the full delay and cleans up on unmount',()=>{
    const view=render(<InitialLoading pending/>);advance(150);expect(screen.getByRole('status')).toBeInTheDocument();
    view.rerender(<InitialLoading pending error/>);expect(screen.queryByRole('status')).toBeNull();
    view.rerender(<InitialLoading pending/>);advance(149);expect(screen.queryByRole('status')).toBeNull();advance(1);expect(screen.getByRole('status')).toBeInTheDocument();
    view.rerender(<InitialLoading pending={false}/>);expect(screen.queryByRole('status')).toBeNull();
    view.rerender(<InitialLoading pending/>);view.unmount();advance(150);expect(vi.getTimerCount()).toBe(0);
  });
  it('tracks hidden tabs without remounting surrounding inputs or stealing focus',()=>{
    const view=render(<><input aria-label="Bản nháp" defaultValue="giữ lại"/><InitialLoading pending/></>);
    const input=screen.getByLabelText('Bản nháp');input.focus();advance(150);
    vi.spyOn(document,'hidden','get').mockReturnValue(true);act(()=>document.dispatchEvent(new Event('visibilitychange')));
    expect(view.container.querySelector('.fg-initial-loading')).toHaveAttribute('data-hidden','true');
    expect(document.activeElement).toBe(input);expect(input).toHaveValue('giữ lại');
    vi.spyOn(document,'hidden','get').mockReturnValue(false);act(()=>document.dispatchEvent(new Event('visibilitychange')));
    expect(view.container.querySelector('.fg-initial-loading')).toHaveAttribute('data-hidden','false');
  });
});

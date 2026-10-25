// Слой поверх экранов: нижние шторки, диалоги, уведомление внизу, просмотр фото, печать карты.
import type { ReactNode } from 'react';
import { create } from 'zustand';
import type { PhotoRef } from '../domain/types';

export interface SheetEntry {
  id: number;
  render: (close: () => void) => ReactNode;
  /** Высота по содержимому (меню действий, короткие формы) */
  auto?: boolean;
  closing?: boolean;
}

export interface ConfirmOpts {
  title: string;
  text?: string;
  ok?: string;
  cancel?: string;
  danger?: boolean;
  /** Слово, которое нужно ввести для подтверждения (защита от случайного удаления) */
  requireWord?: string;
}

export interface ViewerItem {
  photo: PhotoRef;
  title: string;
  sub?: string;
}

export type ViewerState =
  | { mode: 'single'; items: ViewerItem[]; i: number }
  | { mode: 'compare'; a: ViewerItem; b: ViewerItem };

interface ToastState {
  key: number;
  msg: string;
  action?: string;
  onAction?: () => void;
  ms: number;
}

interface UiState {
  sheets: SheetEntry[];
  dialog: (ConfirmOpts & { resolve: (ok: boolean) => void }) | null;
  toastState: ToastState | null;
  viewer: ViewerState | null;
  printClientId: string | null;
  openSheet(render: SheetEntry['render'], opts?: { auto?: boolean }): number;
  closeSheet(id: number): void;
  closeAllSheets(): void;
  confirm(opts: ConfirmOpts): Promise<boolean>;
  toast(msg: string, opts?: { action?: string; onAction?: () => void; ms?: number }): void;
  hideToast(): void;
  openViewer(items: ViewerItem[], i?: number): void;
  openCompare(a: ViewerItem, b: ViewerItem): void;
  closeViewer(): void;
  openPrint(clientId: string): void;
  closePrint(): void;
}

/** Обработчики «закрыть шторку жестом или кнопкой Отмена» — для форм с несохранёнными данными. */
export const sheetDismiss = new Map<number, () => void>();

let seq = 0;
const CLOSE_MS = 280;

export const useUi = create<UiState>((set, get) => ({
  sheets: [],
  dialog: null,
  toastState: null,
  viewer: null,
  printClientId: null,

  openSheet(render, opts = {}) {
    seq += 1;
    const id = seq;
    set({ sheets: [...get().sheets, { id, render, auto: opts.auto }] });
    return id;
  },
  closeSheet(id) {
    sheetDismiss.delete(id);
    set({ sheets: get().sheets.map((s) => (s.id === id ? { ...s, closing: true } : s)) });
    setTimeout(() => set({ sheets: get().sheets.filter((s) => s.id !== id) }), CLOSE_MS);
  },
  closeAllSheets() {
    for (const s of get().sheets) get().closeSheet(s.id);
  },

  confirm(opts) {
    return new Promise((resolve) => set({ dialog: { ...opts, resolve } }));
  },

  toast(msg, opts = {}) {
    seq += 1;
    set({ toastState: { key: seq, msg, action: opts.action, onAction: opts.onAction, ms: opts.ms ?? (opts.action ? 5000 : 2800) } });
  },
  hideToast() {
    set({ toastState: null });
  },

  openViewer(items, i = 0) {
    if (items.length) set({ viewer: { mode: 'single', items, i: Math.max(0, Math.min(i, items.length - 1)) } });
  },
  openCompare(a, b) {
    set({ viewer: { mode: 'compare', a, b } });
  },
  closeViewer() {
    set({ viewer: null });
  },

  openPrint(clientId) {
    set({ printClientId: clientId });
  },
  closePrint() {
    set({ printClientId: null });
  },
}));

/** Короткие вызовы из обработчиков событий. */
export const ui = () => useUi.getState();

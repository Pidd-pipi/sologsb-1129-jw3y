import { create } from 'zustand';
import { db, ensureSeed } from '../db';
import type { CaseInput, CaseLoan, CaseSlot, LoanInput, LoanReturnEntry, ReturnInput, TypeCase } from '../types/case';
import { capacityOf } from '../types/case';
import { makeId, toPlain } from '../utils/format';
import { matrixIdsOf, validateCapacity } from '../utils/layout';

interface CaseState {
  cases: TypeCase[];
  loaded: boolean;
  loading: boolean;
  error: string;
  load: () => Promise<void>;
  createCase: (input: CaseInput) => Promise<TypeCase>;
  updateCase: (id: string, patch: Partial<TypeCase>) => Promise<void>;
  saveSlots: (id: string, slots: CaseSlot[]) => Promise<void>;
  removeCase: (id: string) => Promise<void>;
  /** 借出登记：借给外单位展陈，借出后格位只读 */
  lendCase: (id: string, input: LoanInput) => Promise<void>;
  /** 归还清点：账实相符才解除借用，不符则记录差异说明并保持借用中 */
  returnCase: (id: string, input: ReturnInput) => Promise<{ matched: boolean; entry: LoanReturnEntry }>;
}

export const useCaseStore = create<CaseState>((set, get) => ({
  cases: [],
  loaded: false,
  loading: false,
  error: '',

  load: async () => {
    set({ loading: true, error: '' });
    try {
      await ensureSeed();
      const cases = await db.cases.toArray();
      set({ cases: cases.sort((a, b) => (a.code < b.code ? -1 : 1)), loaded: true, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : '字盘档案读取失败' });
    }
  },

  createCase: async (input) => {
    const now = new Date().toISOString();
    const rows = Number(input.rows);
    const cols = Number(input.cols);
    const row: TypeCase = toPlain({
      id: makeId('case'),
      code: input.code.trim(),
      kind: input.kind,
      rows,
      cols,
      slots: [] as CaseSlot[],
      workStation: input.workStation.trim(),
      matrixId: [] as string[],
      loan: null,
      loanHistory: [] as CaseLoan[],
      createdAt: now,
      updatedAt: now,
    });
    if (capacityOf(rows, cols) <= 0) throw new Error('字盘容量不合法，请检查行列数');
    await db.cases.add(row);
    set((s) => ({ cases: [...s.cases, row].sort((a, b) => (a.code < b.code ? -1 : 1)) }));
    return row;
  },

  updateCase: async (id, patch) => {
    const plain = toPlain(patch);
    const current = get().cases.find((c) => c.id === id);
    // 借用中的字盘格位只读：布局相关的字段一律禁止改动
    if (current?.loan && (plain.slots !== undefined || plain.rows !== undefined || plain.cols !== undefined)) {
      throw new Error(`字盘 ${current.code} 正借给 ${current.loan.borrower} 展陈，归还前布局只读，禁止改动`);
    }
    const next: Partial<TypeCase> = { ...plain, updatedAt: new Date().toISOString() };
    if (plain.rows || plain.cols) {
      const rows = plain.rows ?? current?.rows ?? 0;
      const cols = plain.cols ?? current?.cols ?? 0;
      const slots = plain.slots ?? current?.slots ?? [];
      const check = validateCapacity(rows, cols, slots);
      if (check.overCapacity) throw new Error(check.message);
    }
    await db.cases.update(id, next);
    set((s) => ({ cases: s.cases.map((c) => (c.id === id ? { ...c, ...next } : c)) }));
  },

  /** 保存格位布局：同时刷新 matrixId 多值索引，便于按字模反查字盘 */
  saveSlots: async (id, slots) => {
    const current = get().cases.find((c) => c.id === id);
    if (!current) throw new Error('未找到字盘');
    if (current.loan) {
      throw new Error(`字盘 ${current.code} 正借给 ${current.loan.borrower} 展陈，归还前格位只读，禁止改动`);
    }
    const check = validateCapacity(current.rows, current.cols, slots);
    if (check.overCapacity) throw new Error(check.message);
    const plainSlots = toPlain(slots);
    const next: Partial<TypeCase> = {
      slots: plainSlots,
      matrixId: matrixIdsOf(plainSlots),
      updatedAt: new Date().toISOString(),
    };
    await db.cases.update(id, next);
    set((s) => ({ cases: s.cases.map((c) => (c.id === id ? { ...c, ...next } : c)) }));
  },

  removeCase: async (id) => {
    const current = get().cases.find((c) => c.id === id);
    if (current?.loan) {
      throw new Error(`字盘 ${current.code} 仍借给 ${current.loan.borrower}，归还前不能删除`);
    }
    await db.cases.delete(id);
    set((s) => ({ cases: s.cases.filter((c) => c.id !== id) }));
  },

  lendCase: async (id, input) => {
    const current = get().cases.find((c) => c.id === id);
    if (!current) throw new Error('未找到字盘');
    if (current.loan) {
      throw new Error(`字盘 ${current.code} 已借出给 ${current.loan.borrower}，需先归还才能再次借出`);
    }
    const loan: CaseLoan = {
      borrower: input.borrower.trim(),
      contact: input.contact.trim(),
      expectedReturn: input.expectedReturn,
      lentAt: new Date().toISOString(),
      expectedCount: current.slots.length,
      returns: [],
    };
    const next: Partial<TypeCase> = { loan: toPlain(loan), updatedAt: new Date().toISOString() };
    await db.cases.update(id, next);
    set((s) => ({ cases: s.cases.map((c) => (c.id === id ? { ...c, ...next } : c)) }));
  },

  returnCase: async (id, input) => {
    const current = get().cases.find((c) => c.id === id);
    if (!current) throw new Error('未找到字盘');
    const loan = current.loan;
    if (!loan) throw new Error(`字盘 ${current.code} 当前未借出，无需归还`);
    const expectedCount = current.slots.length;
    const actualCount = Math.floor(Number(input.actualCount));
    if (!Number.isInteger(actualCount) || actualCount < 0) {
      throw new Error('实际枚数需为不小于 0 的整数');
    }
    const entry: LoanReturnEntry = {
      actualCount,
      expectedCount,
      matched: actualCount === expectedCount,
      note: (input.note || '').trim(),
      returnedAt: new Date().toISOString(),
    };
    if (!entry.matched && !entry.note) {
      throw new Error(`实还 ${actualCount} 枚与账面 ${expectedCount} 枚不符，必须填写差异说明`);
    }
    const finished: CaseLoan = { ...loan, returns: [...loan.returns, entry] };
    // 账实相符才解除借用、恢复编辑；不符则保留借用状态并累积差异记录
    const next: Partial<TypeCase> = entry.matched
      ? {
          loan: null,
          loanHistory: [...(current.loanHistory ?? []), finished],
          updatedAt: new Date().toISOString(),
        }
      : { loan: finished, updatedAt: new Date().toISOString() };
    await db.cases.update(id, toPlain(next));
    set((s) => ({ cases: s.cases.map((c) => (c.id === id ? { ...c, ...next } : c)) }));
    return { matched: entry.matched, entry };
  },
}));

/** 找出存放指定字模的字盘与格位 */
export function findCaseHolding(cases: TypeCase[], matrixId: string): Array<{ typeCase: TypeCase; slots: CaseSlot[] }> {
  const out: Array<{ typeCase: TypeCase; slots: CaseSlot[] }> = [];
  for (const c of cases) {
    const slots = c.slots.filter((s) => s.matrixId === matrixId);
    if (slots.length) out.push({ typeCase: c, slots });
  }
  return out;
}

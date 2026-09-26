import { create } from 'zustand';
import { db, ensureSeed } from '../db';
import type { CaseInput, CaseLoan, CaseSlot, LoanInput, ReturnInput, TypeCase } from '../types/case';
import { capacityOf } from '../types/case';
import { makeId, toPlain } from '../utils/format';
import { detectConflicts, matrixIdsOf, validateCapacity } from '../utils/layout';

interface CaseState {
  cases: TypeCase[];
  loaded: boolean;
  loading: boolean;
  error: string;
  load: () => Promise<void>;
  createCase: (input: CaseInput) => Promise<TypeCase>;
  updateCase: (id: string, patch: Partial<TypeCase>) => Promise<void>;
  saveSlots: (id: string, slots: CaseSlot[]) => Promise<void>;
  /** 借出登记：布局有重复落位等冲突时拒绝借出 */
  lendCase: (id: string, input: LoanInput) => Promise<void>;
  /** 归还登记：账实相符才归档并恢复编辑，否则记录差异说明、保持借用中 */
  returnCase: (id: string, input: ReturnInput) => Promise<{ matched: boolean; expected: number }>;
  removeCase: (id: string) => Promise<void>;
}

/** 借用中的字盘格位只读，任何落位改动一律拦截 */
function assertNotOnLoan(typeCase: TypeCase | undefined): asserts typeCase is TypeCase {
  if (!typeCase) throw new Error('未找到字盘');
  if (typeCase.loan) {
    throw new Error(
      `字盘 ${typeCase.code} 正借给 ${typeCase.loan.borrower} 展陈，格位只读，归还前不能改动`,
    );
  }
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
    // 借用中只允许改基本信息，格位布局与行列结构一律锁定
    if (current?.loan && (plain.slots || plain.rows || plain.cols)) {
      throw new Error(
        `字盘 ${current.code} 正借给 ${current.loan.borrower} 展陈，格位只读，归还前不能改动`,
      );
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
    assertNotOnLoan(current);
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

  lendCase: async (id, input) => {
    const current = get().cases.find((c) => c.id === id);
    if (!current) throw new Error('未找到字盘');
    if (current.loan) {
      throw new Error(`字盘 ${current.code} 已借给 ${current.loan.borrower}，请先归还再办理借出`);
    }
    const conflicts = detectConflicts(current.rows, current.cols, current.slots);
    if (conflicts.hasConflict) {
      throw new Error('当前布局存在重复落位或越界格位，请先处理干净再借出，别把有问题的字盘交出去');
    }
    const loan: CaseLoan = {
      borrower: input.borrower.trim(),
      contact: input.contact.trim(),
      expectReturn: input.expectReturn,
      lentAt: new Date().toISOString(),
      lentCount: current.slots.length,
      returns: [],
    };
    const next: Partial<TypeCase> = { loan, updatedAt: new Date().toISOString() };
    await db.cases.update(id, toPlain(next));
    set((s) => ({ cases: s.cases.map((c) => (c.id === id ? { ...c, ...next } : c)) }));
  },

  returnCase: async (id, input) => {
    const current = get().cases.find((c) => c.id === id);
    if (!current) throw new Error('未找到字盘');
    if (!current.loan) throw new Error(`字盘 ${current.code} 当前不在借用中`);
    const expected = current.slots.length;
    const matched = input.actualCount === expected;
    const record = {
      actualCount: input.actualCount,
      matched,
      note: input.note.trim(),
      returnedAt: new Date().toISOString(),
    };
    const loan: CaseLoan = { ...current.loan, returns: [...current.loan.returns, record] };
    // 账实相符：归档本次外借并恢复编辑；不符：留下差异说明，继续保持借用中
    const next: Partial<TypeCase> = matched
      ? { loan: null, loanHistory: [...(current.loanHistory ?? []), loan] }
      : { loan };
    next.updatedAt = new Date().toISOString();
    await db.cases.update(id, toPlain(next));
    set((s) => ({ cases: s.cases.map((c) => (c.id === id ? { ...c, ...next } : c)) }));
    return { matched, expected };
  },

  removeCase: async (id) => {
    const current = get().cases.find((c) => c.id === id);
    if (current?.loan) {
      throw new Error(`字盘 ${current.code} 正借给 ${current.loan.borrower} 展陈，归还前不能删除`);
    }
    await db.cases.delete(id);
    set((s) => ({ cases: s.cases.filter((c) => c.id !== id) }));
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

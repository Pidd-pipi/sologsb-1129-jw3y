/** 字盘（TypeCase）：行列格位组成的字模存放盘 */

/** 字盘类型：常用字盘 / 生僻字盘 */
export const CASE_KINDS = ['常用字盘', '生僻字盘'] as const;
export type CaseKind = (typeof CASE_KINDS)[number];

/** 行数 / 列数合法区间 */
export const ROW_RANGE = { min: 4, max: 16 } as const;
export const COL_RANGE = { min: 4, max: 20 } as const;

/** 一个格位的落位信息（行、列均为 0 基下标） */
export interface CaseSlot {
  row: number;
  col: number;
  character: string;
  matrixId: string;
  /** 落位时间 */
  placedAt: string;
}

/** 一次归还清点记录 */
export interface LoanReturn {
  /** 实际归还枚数 */
  actualCount: number;
  /** 账实是否相符（实际枚数 === 盘中落位数量） */
  matched: boolean;
  /** 差异说明（账实不符时必填） */
  note: string;
  /** 归还登记时间 */
  returnedAt: string;
}

/** 字盘外借记录：登记在字盘上即视为借用中，格位只读 */
export interface CaseLoan {
  /** 借用人 */
  borrower: string;
  /** 联系方式 */
  contact: string;
  /** 预计归还日 YYYY-MM-DD */
  expectReturn: string;
  /** 借出登记时间 */
  lentAt: string;
  /** 借出时盘中落位枚数（快照，归还清点以此为账） */
  lentCount: number;
  /** 历次归还清点（账实不符会留下差异说明，字盘保持借用中） */
  returns: LoanReturn[];
}

export interface TypeCase {
  id: string;
  /** 字盘编号，例：ZP-A-01 */
  code: string;
  kind: CaseKind;
  rows: number;
  cols: number;
  /** 格位布局 */
  slots: CaseSlot[];
  /** 所在工位 */
  workStation: string;
  /**
   * 落位字模 id 集合（多值索引，便于按字模反查字盘）。
   * 由落位操作自动维护，与 slots 中的 matrixId 保持一致。
   */
  matrixId: string[];
  /** 当前外借记录；非空表示借用中，格位只读，任何改动都会被拦截 */
  loan: CaseLoan | null;
  /** 历史外借记录（账实相符归还后归档） */
  loanHistory: CaseLoan[];
  createdAt: string;
  updatedAt: string;
}

export interface CaseInput {
  code: string;
  kind: CaseKind;
  rows: number;
  cols: number;
  workStation: string;
}

/** 外借登记信息 */
export interface LoanInput {
  borrower: string;
  contact: string;
  expectReturn: string;
}

/** 归还登记信息 */
export interface ReturnInput {
  actualCount: number;
  note: string;
}

/** 字盘容量 = 行数 × 列数 */
export function capacityOf(rows: number, cols: number): number {
  if (!Number.isFinite(rows) || !Number.isFinite(cols)) return 0;
  return Math.max(0, Math.floor(rows) * Math.floor(cols));
}

/** 字盘基本信息校验 */
export function validateCaseInput(input: Partial<CaseInput>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!(input.code || '').trim()) errors.code = '字盘编号不能为空';
  if (!input.kind) errors.kind = '请选择字盘类型';
  const rows = Number(input.rows);
  if (!Number.isInteger(rows) || rows < ROW_RANGE.min || rows > ROW_RANGE.max) {
    errors.rows = `行数需在 ${ROW_RANGE.min}–${ROW_RANGE.max} 之间`;
  }
  const cols = Number(input.cols);
  if (!Number.isInteger(cols) || cols < COL_RANGE.min || cols > COL_RANGE.max) {
    errors.cols = `列数需在 ${COL_RANGE.min}–${COL_RANGE.max} 之间`;
  }
  if (!(input.workStation || '').trim()) errors.workStation = '请填写所在工位';
  return errors;
}

/** 字盘容量的文字描述 */
export function describeCapacity(rows: number, cols: number): string {
  return `${rows} 行 × ${cols} 列 = ${capacityOf(rows, cols)} 格`;
}

/** 外借登记校验：借用人、联系方式、预计归还日（不早于今天） */
export function validateLoanInput(input: Partial<LoanInput>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!(input.borrower || '').trim()) errors.borrower = '请登记借用人';
  if (!(input.contact || '').trim()) errors.contact = '请登记联系方式';
  const date = (input.expectReturn || '').trim();
  if (!date) {
    errors.expectReturn = '请选择预计归还日';
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
    errors.expectReturn = '预计归还日不是有效日期';
  } else if (date < new Date().toISOString().slice(0, 10)) {
    errors.expectReturn = '预计归还日不能早于今天';
  }
  return errors;
}

/** 归还登记校验：expected 为盘中落位数量，账实不符时差异说明必填 */
export function validateReturnInput(input: Partial<ReturnInput>, expected: number): Record<string, string> {
  const errors: Record<string, string> = {};
  const n = Number(input.actualCount);
  if (!Number.isInteger(n) || n < 0) {
    errors.actualCount = '实际枚数需为不小于 0 的整数';
  } else if (n !== expected && !(input.note || '').trim()) {
    errors.note = `实际 ${n} 枚与盘中落位 ${expected} 枚不一致，请填写差异说明`;
  }
  return errors;
}

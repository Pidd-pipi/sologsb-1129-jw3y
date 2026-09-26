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

/** 归还清点记录：每次归还清点留一条，账实不符时逐条累积 */
export interface LoanReturnEntry {
  /** 实际归还枚数 */
  actualCount: number;
  /** 账面应还枚数（清点时盘中落位数量） */
  expectedCount: number;
  /** 账实是否相符 */
  matched: boolean;
  /** 差异说明（账实不符时必填） */
  note: string;
  /** 清点时间 */
  returnedAt: string;
}

/** 字盘外借登记（借给外单位展陈） */
export interface CaseLoan {
  /** 借用人 */
  borrower: string;
  /** 联系方式 */
  contact: string;
  /** 预计归还日 YYYY-MM-DD */
  expectedReturn: string;
  /** 借出时间 */
  lentAt: string;
  /** 借出时盘中落位数量（账面枚数） */
  expectedCount: number;
  /** 归还清点记录 */
  returns: LoanReturnEntry[];
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
  /** 当前外借记录；null 表示在库（格位可编辑），借用中格位只读 */
  loan: CaseLoan | null;
  /** 已归还的历史外借记录 */
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

/** 外借登记表单 */
export interface LoanInput {
  borrower: string;
  contact: string;
  expectedReturn: string;
}

/** 归还清点表单 */
export interface ReturnInput {
  actualCount: number;
  note: string;
}

/** 本机今天，YYYY-MM-DD */
function localToday(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 外借登记校验：借用人、联系方式、预计归还日必填 */
export function validateLoanInput(input: Partial<LoanInput>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!(input.borrower || '').trim()) errors.borrower = '借用人不能为空';
  if (!(input.contact || '').trim()) errors.contact = '联系方式不能为空';
  const date = (input.expectedReturn || '').trim();
  if (!date) {
    errors.expectedReturn = '请选择预计归还日';
  } else if (Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
    errors.expectedReturn = '预计归还日格式不正确';
  } else if (date < localToday()) {
    errors.expectedReturn = '预计归还日不能早于今天';
  }
  return errors;
}

/** 归还清点校验：expectedCount 为盘中落位数量（账面枚数），账实不符时差异说明必填 */
export function validateReturnInput(
  input: { actualCount: number | string; note?: string },
  expectedCount: number,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const raw = typeof input.actualCount === 'string' ? input.actualCount.trim() : input.actualCount;
  const n = raw === '' || raw === undefined || raw === null ? Number.NaN : Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    errors.actualCount = '实际枚数需为不小于 0 的整数';
  } else if (n !== expectedCount && !(input.note || '').trim()) {
    errors.note = `实还 ${n} 枚与账面 ${expectedCount} 枚不符，请填写差异说明`;
  }
  return errors;
}

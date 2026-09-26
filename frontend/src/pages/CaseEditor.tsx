import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import CharacterPicker from '../components/common/CharacterPicker';
import EmptyState from '../components/common/EmptyState';
import LayoutGrid from '../components/common/LayoutGrid';
import { DRAFT_KEYS, useLocalDraft } from '../hooks/useLocalDraft';
import { useCaseSlots } from '../hooks/useCaseSlots';
import { useMatrixSearch } from '../hooks/useMatrixSearch';
import { useCaseStore } from '../stores/caseStore';
import { useUiStore } from '../stores/uiStore';
import type { CaseKind, CaseSlot, TypeCase } from '../types/case';
import {
  CASE_KINDS,
  COL_RANGE,
  ROW_RANGE,
  describeCapacity,
  validateCaseInput,
  validateLoanInput,
  validateReturnInput,
} from '../types/case';
import type { TypeMatrix } from '../types/matrix';
import { addDays, formatDate, formatStamp, suggestCaseCode, todayStr } from '../utils/format';
import { rcKey, slotAt, type RCCell } from '../utils/layout';

/** 字盘列表 + 新建字盘 */
export default function CaseEditor() {
  const cases = useCaseStore((s) => s.cases);
  const loaded = useCaseStore((s) => s.loaded);
  const createCase = useCaseStore((s) => s.createCase);
  const selectedCaseId = useUiStore((s) => s.selectedCaseId);
  const setSelectedCaseId = useUiStore((s) => s.setSelectedCaseId);
  const pushToast = useUiStore((s) => s.pushToast);

  const [form, setForm] = useState({
    code: '',
    kind: '常用字盘' as CaseKind,
    rows: '6',
    cols: '8',
    workStation: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selected = useMemo(
    () => cases.find((c) => c.id === selectedCaseId) ?? cases[0],
    [cases, selectedCaseId],
  );

  useEffect(() => {
    if (!selectedCaseId && cases.length > 0) setSelectedCaseId(cases[0].id);
  }, [cases, selectedCaseId, setSelectedCaseId]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const input = {
      code: form.code,
      kind: form.kind,
      rows: Number(form.rows),
      cols: Number(form.cols),
      workStation: form.workStation,
    };
    const next = validateCaseInput(input);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      pushToast('字盘信息未通过校验，请按提示修正', 'warn');
      return;
    }
    try {
      const row = await createCase(input);
      setSelectedCaseId(row.id);
      setForm({ ...form, code: '', workStation: '' });
      setErrors({});
      pushToast(`已新建字盘 ${row.code}（${describeCapacity(row.rows, row.cols)}）`);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : '新建字盘失败', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="mt-title" data-testid="case-editor-title">
            字盘布局编辑器
          </h2>
          <p className="mt-sub">
            选中字盘后以行列网格呈现，点击格位落位、取出或调换字符，实时提示空格与重复落位。
          </p>
        </div>
        <span className="mt-chip" data-testid="case-count">
          字盘 {cases.length} 个
        </span>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_1fr]">
        <aside className="space-y-3">
          <div className="mt-panel">
            <div className="mt-panel-head">
              <h3 className="font-song text-sm font-semibold text-ink">字盘清单</h3>
            </div>
            <ul className="divide-y divide-paper-line" data-testid="case-list">
              {cases.length === 0 ? (
                <li className="px-4 py-3 text-xs text-ink-mute">
                  {loaded ? '暂无字盘，请在下方新建。' : '正在读取字盘档案…'}
                </li>
              ) : (
                cases.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      data-testid={`case-item-${c.id}`}
                      onClick={() => setSelectedCaseId(c.id)}
                      className={`flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left transition hover:bg-paper-deep/60 ${
                        selected?.id === c.id ? 'bg-seal-pale/70' : ''
                      }`}
                    >
                      <span className="font-song text-sm text-ink">
                        {c.code}
                        <span className="ml-2 text-[11px] text-ink-mute">{c.kind}</span>
                      </span>
                      <span className="text-[11px] text-ink-mute">
                        {describeCapacity(c.rows, c.cols)} · 已落位 {c.slots.length} · {c.workStation}
                      </span>
                      {c.loan ? (
                        <span
                          className="mt-chip border-brass/50 bg-brass-pale text-brass"
                          data-testid={`case-loan-${c.id}`}
                        >
                          借用中 · {c.loan.borrower}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <form className="mt-panel space-y-3 px-4 py-3" onSubmit={handleCreate} data-testid="case-create-form">
            <h3 className="font-song text-sm font-semibold text-ink">新建字盘</h3>
            <div>
              <label className="mt-label" htmlFor="case-code-input">
                字盘编号
              </label>
              <input
                id="case-code-input"
                data-testid="case-code-input"
                className="mt-input"
                placeholder={suggestCaseCode(cases.length + 1)}
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              />
              {errors.code ? <p className="mt-error" data-testid="error-case-code">{errors.code}</p> : null}
            </div>
            <div>
              <label className="mt-label" htmlFor="case-kind-select">
                类型
              </label>
              <select
                id="case-kind-select"
                data-testid="case-kind-select"
                className="mt-input"
                value={form.kind}
                onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value as CaseKind }))}
              >
                {CASE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mt-label" htmlFor="case-rows-input">
                  行数
                </label>
                <input
                  id="case-rows-input"
                  data-testid="case-rows-input"
                  className="mt-input"
                  type="number"
                  min={ROW_RANGE.min}
                  max={ROW_RANGE.max}
                  step={1}
                  value={form.rows}
                  onChange={(e) => setForm((p) => ({ ...p, rows: e.target.value }))}
                />
                {errors.rows ? <p className="mt-error">{errors.rows}</p> : null}
              </div>
              <div>
                <label className="mt-label" htmlFor="case-cols-input">
                  列数
                </label>
                <input
                  id="case-cols-input"
                  data-testid="case-cols-input"
                  className="mt-input"
                  type="number"
                  min={COL_RANGE.min}
                  max={COL_RANGE.max}
                  step={1}
                  value={form.cols}
                  onChange={(e) => setForm((p) => ({ ...p, cols: e.target.value }))}
                />
                {errors.cols ? <p className="mt-error">{errors.cols}</p> : null}
              </div>
            </div>
            <div>
              <label className="mt-label" htmlFor="case-station-input">
                所在工位
              </label>
              <input
                id="case-station-input"
                data-testid="case-station-input"
                className="mt-input"
                placeholder="例：三号排字工位"
                value={form.workStation}
                onChange={(e) => setForm((p) => ({ ...p, workStation: e.target.value }))}
              />
              {errors.workStation ? <p className="mt-error">{errors.workStation}</p> : null}
            </div>
            <button type="submit" className="mt-btn mt-btn-primary" data-testid="create-case-btn">
              新建字盘
            </button>
            <p className="mt-hint">
              容量：{describeCapacity(Number(form.rows) || 0, Number(form.cols) || 0)}
            </p>
          </form>
        </aside>

        {selected ? (
          <CaseLayoutEditor key={selected.id} typeCase={selected} />
        ) : (
          <EmptyState
            title="尚未选择字盘"
            description="在左侧清单中选择一个字盘，或先新建一个字盘后再编辑格位布局。"
            testId="case-empty"
          />
        )}
      </div>
    </div>
  );
}

interface PendingPlacement {
  matrix: TypeMatrix;
}

function CaseLayoutEditor({ typeCase }: { typeCase: TypeCase }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const lendCase = useCaseStore((s) => s.lendCase);
  const returnCase = useCaseStore((s) => s.returnCase);
  const api = useCaseSlots(typeCase);
  const { results: candidateMatrices } = useMatrixSearch({ availability: ['可用'], ignoreKeyword: true });
  const [pickedChar, setPickedChar] = useState('');
  const [pending, setPending] = useState<PendingPlacement | null>(null);
  const [selectedKey, setSelectedKey] = useState('');
  const [swapFrom, setSwapFrom] = useState<RCCell | null>(null);
  const [loanForm, setLoanForm] = useState({
    borrower: '',
    contact: '',
    expectReturn: addDays(todayStr(), 30),
  });
  const [loanErrors, setLoanErrors] = useState<Record<string, string>>({});
  const [returnForm, setReturnForm] = useState({ actualCount: '', note: '' });
  const [returnErrors, setReturnErrors] = useState<Record<string, string>>({});

  /** 借用中：格位只读，任何改动都要被挡住 */
  const loan = typeCase.loan;
  const locked = Boolean(loan);

  const { draft, patch, reset: resetDraft } = useLocalDraft<{ slots: CaseSlot[] }>(
    DRAFT_KEYS.caseEditor(typeCase.id),
    { slots: typeCase.slots },
  );

  /** 格位布局有未保存改动时，把编辑中的行列布局写入 localStorage 草稿 */
  useEffect(() => {
    if (!api.dirty) return;
    patch({ slots: api.slots });
  }, [api.dirty, api.slots, patch]);

  const charCandidates = useMemo(
    () => (pickedChar ? candidateMatrices.filter((m) => m.character === pickedChar) : []),
    [candidateMatrices, pickedChar],
  );

  const draftDiffers = useMemo(
    () => JSON.stringify(draft.slots) !== JSON.stringify(typeCase.slots),
    [draft.slots, typeCase.slots],
  );

  const selectedCell = selectedKey ? (parseKey(selectedKey) as RCCell) : null;
  const selectedSlot = selectedCell ? slotAt(api.slots, selectedCell.row, selectedCell.col) : undefined;

  const conflictKeys = useMemo(
    () => [
      ...api.conflicts.duplicatePositions,
      ...api.conflicts.outOfRange,
      ...api.conflicts.duplicateCharacters.flatMap((g) => g.keys),
    ],
    [api.conflicts],
  );

  const handleSlotClick = (row: number, col: number) => {
    if (locked) {
      pushToast(`字盘 ${typeCase.code} 借用中，格位只读`, 'warn');
      return;
    }
    const key = rcKey(row, col);
    setSelectedKey(key);
    if (pending) {
      api.place(pending.matrix, row, col);
      pushToast(
        `已在 ${rowLabel(row)}${col + 1} 落位「${pending.matrix.character}」（${pending.matrix.code}）`,
      );
      return;
    }
    if (swapFrom) {
      if (swapFrom.row === row && swapFrom.col === col) {
        setSwapFrom(null);
        return;
      }
      api.swap(swapFrom, { row, col });
      setSwapFrom(null);
      pushToast(`已调换 ${rowLabel(swapFrom.row)}${swapFrom.col + 1} 与 ${rowLabel(row)}${col + 1}`);
      return;
    }
    if (slotAt(api.slots, row, col)) {
      setSwapFrom({ row, col });
    }
  };

  const handleSave = async () => {
    try {
      await api.save();
      patch({ slots: api.slots });
      pushToast(`字盘 ${typeCase.code} 布局已保存（${api.slots.length} 格）`);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : '保存失败', 'error');
    }
  };

  /** 借出登记：布局未保存或有重复落位时先提示处理，不把有问题的字盘交出去 */
  const handleLend = async (e: FormEvent) => {
    e.preventDefault();
    const errors = validateLoanInput(loanForm);
    setLoanErrors(errors);
    if (Object.keys(errors).length > 0) {
      pushToast('借出登记未通过校验，请按提示修正', 'warn');
      return;
    }
    if (api.dirty || draftDiffers) {
      pushToast('当前布局还有未保存的改动，请先「保存布局」或「撤回落库版本」再办理借出', 'warn');
      return;
    }
    if (api.conflicts.hasConflict) {
      pushToast('当前布局存在重复落位或越界格位，请先处理再借出', 'warn');
      return;
    }
    try {
      await lendCase(typeCase.id, loanForm);
      pushToast(`字盘 ${typeCase.code} 已借给 ${loanForm.borrower.trim()}，预计 ${formatDate(loanForm.expectReturn)} 归还`);
      setLoanForm({ borrower: '', contact: '', expectReturn: addDays(todayStr(), 30) });
      setLoanErrors({});
      setPending(null);
      setSwapFrom(null);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : '借出登记失败', 'error');
    }
  };

  /** 归还登记：账实不符时记录差异说明并保持借用中，相符后才恢复编辑 */
  const handleReturn = async (e: FormEvent) => {
    e.preventDefault();
    const input = {
      actualCount: returnForm.actualCount === '' ? Number.NaN : Number(returnForm.actualCount),
      note: returnForm.note,
    };
    const errors = validateReturnInput(input, typeCase.slots.length);
    setReturnErrors(errors);
    if (Object.keys(errors).length > 0) {
      pushToast('归还登记未通过校验，请按提示修正', 'warn');
      return;
    }
    try {
      const result = await returnCase(typeCase.id, input);
      if (result.matched) {
        pushToast(`字盘 ${typeCase.code} 已归还，账实相符（${result.expected} 枚），格位恢复编辑`);
        setReturnForm({ actualCount: '', note: '' });
        setReturnErrors({});
      } else {
        pushToast(`实际枚数与盘中落位 ${result.expected} 枚不一致，已记录差异说明，字盘仍为借用中`, 'warn');
        setReturnForm((p) => ({ ...p, actualCount: '' }));
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : '归还登记失败', 'error');
    }
  };

  return (
    <section className="space-y-3">
      <div className="mt-panel">
        <div className="mt-panel-head">
          <div>
            <h3 className="font-song text-sm font-semibold text-ink">
              {typeCase.code} · {typeCase.kind}
              {loan ? (
                <span
                  className="ml-2 inline-flex items-center rounded-full border border-brass/50 bg-brass-pale px-2 py-0.5 align-middle text-[11px] text-brass"
                  data-testid="loan-status-chip"
                >
                  借用中 · {loan.borrower}
                </span>
              ) : null}
            </h3>
            <p className="mt-sub">
              {describeCapacity(typeCase.rows, typeCase.cols)} · 工位 {typeCase.workStation} · 落位率{' '}
              {api.fillPercent}%
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="mt-btn mt-btn-primary" data-testid="save-layout-btn" onClick={handleSave} disabled={api.saving || locked}>
              {api.saving ? '保存中…' : api.dirty ? '保存布局（有改动）' : '保存布局'}
            </button>
            <button type="button" className="mt-btn" data-testid="revert-layout-btn" onClick={api.revert} disabled={!api.dirty || locked}>
              撤回落库版本
            </button>
            <button
              type="button"
              className="mt-btn"
              data-testid="clear-grid-btn"
              disabled={locked}
              onClick={() => {
                api.clear();
                pushToast('已清空当前格位（尚未保存）', 'warn');
              }}
            >
              清空格位
            </button>
          </div>
        </div>

        {loan ? (
          <div
            className="border-b border-brass/30 bg-brass-pale/70 px-4 py-2 text-xs text-brass"
            data-testid="loan-banner"
            role="status"
          >
            字盘正借给 {loan.borrower}（{loan.contact}）展陈，预计 {formatDate(loan.expectReturn)} 归还 ·
            借出时落位 {loan.lentCount} 枚 · 格位只供查看，归还并账实相符后才恢复编辑
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[1fr_300px]">
          <div className="space-y-2">
            <LayoutGrid
              rows={typeCase.rows}
              cols={typeCase.cols}
              slots={api.slots}
              highlight={selectedCell}
              conflictKeys={conflictKeys}
              pendingCharacter={pending?.matrix.character ?? ''}
              readOnly={locked}
              onSlotClick={handleSlotClick}
              testIdPrefix="case-slot"
            />
            <div
              className={`rounded border px-3 py-2 text-xs ${
                api.conflicts.hasConflict || api.capacity.overCapacity
                  ? 'border-seal/40 bg-seal-pale text-seal'
                  : 'border-paper-line bg-paper/50 text-ink-soft'
              }`}
              data-testid="slot-warning"
            >
              <p data-testid="capacity-message">{api.capacity.message}</p>
              <p>
                空格 {api.emptyCells.length} 个
                {api.conflicts.duplicateCharacters.length > 0
                  ? ` · 重复落位 ${api.conflicts.duplicateCharacters
                      .map((g) => `${g.character}×${g.count}`)
                      .join('、')}`
                  : ' · 无重复落位'}
                {api.conflicts.duplicatePositions.length > 0
                  ? ` · 同格位重复 ${api.conflicts.duplicatePositions.join('、')}`
                  : ''}
                {api.conflicts.outOfRange.length > 0
                  ? ` · 越界格位 ${api.conflicts.outOfRange.join('、')}`
                  : ''}
              </p>
              {api.dirty ? (
                <p className="mt-1" data-testid="dirty-hint">
                  当前布局尚未保存到本机档案，点「保存布局」写回 IndexedDB。
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            {loan ? (
              <div className="space-y-3 rounded border border-brass/40 bg-brass-pale/50 px-3 py-3" data-testid="loan-panel">
                <h4 className="font-song text-sm font-semibold text-ink">外借展陈 · 借用中</h4>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs" data-testid="loan-info">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-ink-mute">借用人</dt>
                    <dd className="text-ink-soft" data-testid="loan-info-borrower">{loan.borrower}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-ink-mute">联系方式</dt>
                    <dd className="text-ink-soft" data-testid="loan-info-contact">{loan.contact}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-ink-mute">预计归还日</dt>
                    <dd className="text-ink-soft" data-testid="loan-info-expect">{formatDate(loan.expectReturn)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-ink-mute">借出时间</dt>
                    <dd className="text-ink-soft" data-testid="loan-info-lent-at">{formatStamp(loan.lentAt)}</dd>
                  </div>
                  <div className="col-span-2 flex flex-col gap-0.5">
                    <dt className="text-ink-mute">借出时落位</dt>
                    <dd className="text-ink-soft" data-testid="loan-info-lent-count">{loan.lentCount} 枚</dd>
                  </div>
                </dl>

                <form className="space-y-2 border-t border-brass/30 pt-2" onSubmit={handleReturn} data-testid="return-form">
                  <div>
                    <label className="mt-label" htmlFor="return-actual-count">
                      实际归还枚数（盘中落位 {typeCase.slots.length} 枚）
                    </label>
                    <input
                      id="return-actual-count"
                      data-testid="return-actual-count"
                      type="number"
                      min={0}
                      step={1}
                      className="mt-input"
                      placeholder={`应与盘中落位 ${typeCase.slots.length} 枚一致`}
                      value={returnForm.actualCount}
                      onChange={(e) => setReturnForm((p) => ({ ...p, actualCount: e.target.value }))}
                    />
                    {returnErrors.actualCount ? (
                      <p className="mt-error" data-testid="error-return-actual-count">{returnErrors.actualCount}</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="mt-label" htmlFor="return-note">
                      差异说明（账实不符时必填）
                    </label>
                    <input
                      id="return-note"
                      data-testid="return-note"
                      className="mt-input"
                      placeholder="例：短缺 2 枚，已联系借用人择日补还"
                      value={returnForm.note}
                      onChange={(e) => setReturnForm((p) => ({ ...p, note: e.target.value }))}
                    />
                    {returnErrors.note ? (
                      <p className="mt-error" data-testid="error-return-note">{returnErrors.note}</p>
                    ) : null}
                  </div>
                  <button type="submit" className="mt-btn mt-btn-primary" data-testid="return-case-btn">
                    登记归还
                  </button>
                  <p className="mt-hint">账实相符才归档并恢复编辑；不符则记录差异说明，字盘保持借用中。</p>
                </form>

                {loan.returns.length > 0 ? (
                  <ul className="space-y-1 border-t border-brass/30 pt-2" data-testid="return-records">
                    {loan.returns.map((r, i) => (
                      <li
                        key={`${r.returnedAt}-${i}`}
                        className="text-[11px] text-ink-soft"
                        data-testid={`return-record-${i}`}
                      >
                        {formatStamp(r.returnedAt)} 清点 {r.actualCount} 枚 ·{' '}
                        {r.matched ? '账实相符' : `差异：${r.note || '未填写'}`}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <form className="space-y-2 rounded border border-paper-line bg-white/70 px-3 py-3" onSubmit={handleLend} data-testid="loan-form">
                <h4 className="font-song text-sm font-semibold text-ink">外借展陈登记</h4>
                <div>
                  <label className="mt-label" htmlFor="loan-borrower">
                    借用人
                  </label>
                  <input
                    id="loan-borrower"
                    data-testid="loan-borrower"
                    className="mt-input"
                    placeholder="例：市博物馆 王老师"
                    value={loanForm.borrower}
                    onChange={(e) => setLoanForm((p) => ({ ...p, borrower: e.target.value }))}
                  />
                  {loanErrors.borrower ? (
                    <p className="mt-error" data-testid="error-loan-borrower">{loanErrors.borrower}</p>
                  ) : null}
                </div>
                <div>
                  <label className="mt-label" htmlFor="loan-contact">
                    联系方式
                  </label>
                  <input
                    id="loan-contact"
                    data-testid="loan-contact"
                    className="mt-input"
                    placeholder="例：138-0000-0000"
                    value={loanForm.contact}
                    onChange={(e) => setLoanForm((p) => ({ ...p, contact: e.target.value }))}
                  />
                  {loanErrors.contact ? (
                    <p className="mt-error" data-testid="error-loan-contact">{loanErrors.contact}</p>
                  ) : null}
                </div>
                <div>
                  <label className="mt-label" htmlFor="loan-expect-return">
                    预计归还日
                  </label>
                  <input
                    id="loan-expect-return"
                    data-testid="loan-expect-return"
                    type="date"
                    className="mt-input"
                    min={todayStr()}
                    value={loanForm.expectReturn}
                    onChange={(e) => setLoanForm((p) => ({ ...p, expectReturn: e.target.value }))}
                  />
                  {loanErrors.expectReturn ? (
                    <p className="mt-error" data-testid="error-loan-expect-return">{loanErrors.expectReturn}</p>
                  ) : null}
                </div>
                <button type="submit" className="mt-btn mt-btn-primary" data-testid="lend-case-btn">
                  登记借出
                </button>
                <p className="mt-hint">
                  借出前请确认布局已保存且无重复落位；借出后格位只供查看，归还并账实相符后才恢复编辑。
                </p>
              </form>
            )}

            {typeCase.loanHistory.length > 0 ? (
              <div className="rounded border border-paper-line bg-white/70 px-3 py-3" data-testid="loan-history">
                <h4 className="mb-2 font-song text-sm font-semibold text-ink">外借历史</h4>
                <ul className="space-y-1">
                  {typeCase.loanHistory.map((h, i) => (
                    <li key={`${h.lentAt}-${i}`} className="text-[11px] text-ink-soft" data-testid={`loan-history-${i}`}>
                      {formatStamp(h.lentAt)} 借给 {h.borrower}（{h.contact}）· {h.lentCount} 枚 ·{' '}
                      {h.returns.length > 0
                        ? `${formatStamp(h.returns[h.returns.length - 1].returnedAt)} 归还，账实相符`
                        : '已归还'}
                      {h.returns.some((r) => !r.matched) ? ' · 归还时曾有差异' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <fieldset disabled={locked} className="min-w-0 space-y-3" data-testid="layout-edit-fieldset">
            <div className="rounded border border-paper-line bg-white/70 px-3 py-3">
              <h4 className="mb-2 font-song text-sm font-semibold text-ink">落位操作</h4>
              <CharacterPicker
                value={pickedChar}
                onChange={(char) => {
                  setPickedChar(char);
                  setPending(null);
                }}
                label="待落位字符"
                testId="case-character-picker"
                compact
              />
              <div className="mt-2 space-y-1">
                <p className="text-[11px] text-ink-mute">
                  可用字模候选 {charCandidates.length} 枚（按总览页筛选条件）
                </p>
                {pickedChar && charCandidates.length === 0 ? (
                  <p className="text-[11px] text-seal" data-testid="no-candidate">
                    「{pickedChar}」当前没有可用字模，请先到「字模登记」登记或补刻。
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1">
                  {charCandidates.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      data-testid={`candidate-matrix-${m.id}`}
                      onClick={() => setPending({ matrix: m })}
                      className={`rounded border px-2 py-1 text-[11px] transition ${
                        pending?.matrix.id === m.id
                          ? 'border-seal bg-seal text-paper'
                          : 'border-paper-line bg-white text-ink-soft hover:border-seal'
                      }`}
                    >
                      {m.character} · {m.code} · {m.sizeName}
                    </button>
                  ))}
                </div>
                {pending ? (
                  <p className="text-[11px] text-seal" data-testid="pending-hint">
                    待落位：{pending.matrix.character}（{pending.matrix.code}），点击网格格位完成落位。
                  </p>
                ) : (
                  <p className="text-[11px] text-ink-mute">先选字符与字模，再点网格落位。</p>
                )}
              </div>
            </div>

            <div className="rounded border border-paper-line bg-white/70 px-3 py-3" data-testid="slot-actions">
              <h4 className="mb-2 font-song text-sm font-semibold text-ink">格位操作</h4>
              <p className="text-[11px] text-ink-soft" data-testid="selected-slot-info">
                {selectedCell
                  ? `选中格位：${rowLabel(selectedCell.row)}${selectedCell.col + 1}${
                      selectedSlot ? ` · ${selectedSlot.character}（${selectedSlot.matrixId}）` : ' · 空格'
                    }`
                  : '未选中格位（点击网格选择）'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="mt-btn"
                  data-testid="take-slot-btn"
                  disabled={!selectedCell || !selectedSlot}
                  onClick={() => {
                    if (!selectedCell) return;
                    api.take(selectedCell.row, selectedCell.col);
                    pushToast('已取出该格字模（尚未保存）', 'warn');
                  }}
                >
                  取出选中格
                </button>
                <button
                  type="button"
                  className="mt-btn"
                  data-testid="swap-start-btn"
                  disabled={!selectedCell || !selectedSlot}
                  onClick={() => setSwapFrom(selectedCell)}
                >
                  设为调换起点
                </button>
                <button
                  type="button"
                  className="mt-btn"
                  data-testid="swap-cancel-btn"
                  disabled={!swapFrom}
                  onClick={() => setSwapFrom(null)}
                >
                  取消调换
                </button>
              </div>
              {swapFrom ? (
                <p className="mt-1 text-[11px] text-seal" data-testid="swap-hint">
                  调换起点：{rowLabel(swapFrom.row)}
                  {swapFrom.col + 1}，请点击目标格位完成调换。
                </p>
              ) : null}
            </div>

            <div className="rounded border border-paper-line bg-white/70 px-3 py-3" data-testid="draft-panel">
              <h4 className="mb-2 font-song text-sm font-semibold text-ink">布局草稿</h4>
              <p className="text-[11px] text-ink-mute" data-testid="draft-status">
                {draftDiffers
                  ? `存在未保存的布局草稿（${draft.slots.length} 格），刷新后可恢复`
                  : '草稿与已保存布局一致'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="mt-btn"
                  data-testid="restore-draft-btn"
                  disabled={!draftDiffers}
                  onClick={() => {
                    api.replaceAll(draft.slots);
                    pushToast(`已恢复草稿布局（${draft.slots.length} 格）`);
                  }}
                >
                  恢复草稿
                </button>
                <button
                  type="button"
                  className="mt-btn"
                  data-testid="discard-draft-btn"
                  disabled={!draftDiffers}
                  onClick={() => {
                    resetDraft();
                    api.revert();
                    pushToast('已放弃草稿', 'warn');
                  }}
                >
                  放弃草稿
                </button>
              </div>
            </div>
            </fieldset>

            <Link className="mt-btn block text-center" to="/defects" data-testid="goto-defects">
              去登记缺损 / 补刻
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function rowLabel(row: number): string {
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[row] ?? String(row + 1);
}

function parseKey(key: string): RCCell | null {
  const [r, c] = key.split('-');
  const row = Number(r);
  const col = Number(c);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  return { row, col };
}

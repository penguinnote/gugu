"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { DownloadLink } from "@/components/download-link";
import { BTN, ICON, Icon } from "@/components/ui";
import { CARE_STATUS_LABELS, GENDER_LABELS, PERSON_STATUS_LABELS, memberRoleLabel } from "@/lib/labels";
import type { GroupRef, PersonAdminRow } from "@/lib/people-admin";
import type { Database } from "@/lib/supabase/database.types";

import { setOfficer } from "./[id]/actions";
import { PanelDirty } from "./panel-dirty";

type Enums = Database["public"]["Enums"];
/** 넓은 표의 한 줄 — 운영자 명단의 사람 줄에 명단 칸 몇 개(훈련 단계 · 성별 · 캠퍼스)를 더한 것 */
export type WidePerson = PersonAdminRow & { training_stage: string | null; gender: Enums["gender"] | null; campus: string | null };
type RoleFilter = "" | "head" | "sub" | "member";
const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: "", label: "모든 구분" },
  { value: "head", label: "목자" },
  { value: "sub", label: "목동" },
  { value: "member", label: "양" },
];
const roleOf = (p: PersonAdminRow): RoleFilter => (p.group_role === "leader" ? (p.is_group_head ? "head" : "sub") : "member");

/** 표에 보일 사람 — 이름 찾기(띄어쓰기 무시) · 목장 · 구분 · 상태. 목장 차례(받은 groups) → 목자 → 목동 → 양 → 이름, 떠난 사람은 맨 아래 */
export function filterPeople(people: WidePerson[], groups: GroupRef[], f: { q: string; group: string; role: RoleFilter; status: string }): WidePerson[] {
  const k = f.q.replace(/\s+/g, "");
  const order = new Map(groups.map((g, i) => [g.id, i]));
  const rank = (p: PersonAdminRow) => (p.status === "left" ? 3 : p.group_role === "leader" ? (p.is_group_head ? 0 : 1) : 2);
  return people
    .filter((p) => (!k || p.name.replace(/\s+/g, "").includes(k)) && (!f.group || p.group_id === f.group) && (!f.role || roleOf(p) === f.role) && (!f.status || p.status === f.status))
    .sort((a, b) => (order.get(a.group_id ?? "") ?? 999) - (order.get(b.group_id ?? "") ?? 999) || rank(a) - rank(b) || a.name.localeCompare(b.name, "ko"));
}

/**
 * 넓은 화면 운영자 명단(2026-11-27, 1024px 이상) — 사람이 한 줄인 표. 휴대폰 명단(목장별 카드)과 같은 데이터.
 *   머리     제목 · 청년부 n명 · 목장 n곳 · 계정 연결 n명 · 오른쪽 명단 엑셀 · AI 동의 · 새 사람 등록
 *   도구줄   이름 찾기 · 목장 · 구분 · 상태
 *   고르기   한 명 이상 고르면 연두 띠 — 임원진 맡기기(지금 임원진 스위치를 사람마다 켠다, 계정이 없는 사람은 건너뜀) · 선택 풀기
 *            목장 이동 신청은 넣지 않았다 — 운영자에게는 신청 권한이 없다(목장을 바로 옮긴다)
 *   편집 칸  이름을 누르면 오른쪽에 사람 화면과 같은 항목 · 같은 저장(?p= 에 남는다). 고친 채 다른 사람을 누르면 버릴지 묻는다
 */
export function PeopleWide({
  people,
  groups,
  selectedId,
  panel,
  basePath = "/admin/people",
}: {
  people: WidePerson[];
  groups: GroupRef[];
  selectedId: string | null;
  panel: ReactNode;
  /** 고른 사람을 남길 주소(?p=) — 디자인 확인 화면은 제 주소 */
  basePath?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [role, setRole] = useState<RoleFilter>("");
  const [status, setStatus] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [askOfficer, setAskOfficer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const reportDirty = useCallback((d: boolean) => setDirty(d), []);

  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const shown = useMemo(() => filterPeople(people, groups, { q, group, role, status }), [people, groups, q, group, role, status]);
  const active = people.filter((p) => p.status !== "left");
  const pickedPeople = people.filter((p) => picked.has(p.id));
  const linkedPicked = pickedPeople.filter((p) => p.user_id && !p.is_officer);
  const allShown = shown.length > 0 && shown.every((p) => picked.has(p.id));

  const open = (id: string) => {
    const href = `${basePath}${basePath.includes("?") ? "&" : "?"}p=${id}`;
    if (id === selectedId) return;
    if (dirty) setLeaveTo(href);
    else router.replace(href, { scroll: false });
  };
  const toggle = (id: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const giveOfficer = async () => {
    setBusy(true);
    let done = 0;
    const failed: string[] = [];
    for (const p of linkedPicked) {
      const r = await setOfficer(p.id, true);
      if (r.ok) done++;
      else failed.push(p.name);
    }
    const skipped = pickedPeople.length - linkedPicked.length;
    setBusy(false);
    setAskOfficer(false);
    setResult([`${done}명에게 임원진을 맡겼어요`, skipped ? `${skipped}명은 계정이 없거나 이미 임원진이라 건너뛰었어요` : "", failed.length ? `못 맡김: ${failed.join(", ")}` : ""].filter(Boolean).join(" · "));
    setPicked(new Set());
    router.refresh();
  };
  const SELECT = "h-10 rounded-full bg-[var(--gg-field)] px-4 text-[14px] font-semibold outline-none";

  return (
    <div className="space-y-4" data-testid="people-wide">
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="gg-display text-[28px] leading-tight">명단</h1>
          <p className="text-[14px] text-muted tabular-nums" data-testid="people-wide-sub">
            청년부 {active.length}명 · 목장 {groups.length}곳 · 계정 연결 {active.filter((p) => p.user_id).length}명
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DownloadLink href="/export/roster" className={`${BTN("white", "sm")} !h-10`} testId="people-wide-xlsx">
            <Icon d={ICON.export} className="h-4 w-4" strokeWidth={2.4} />
            명단 엑셀
          </DownloadLink>
          <Link href="/admin/people/ai-consent" className={`${BTN("white", "sm")} !h-10`}>
            AI 동의
          </Link>
          <Link href="/admin/people/new" className={`${BTN("leaf", "sm")} !h-10`}>
            새 사람 등록
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-5">
        <div className="min-w-0 overflow-hidden rounded-[22px] bg-[var(--gg-card)] shadow-[var(--gg-card-shadow)]">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--gg-line)] px-4 py-3">
            <label className="flex h-10 min-w-[11rem] flex-1 items-center gap-2 rounded-full bg-[var(--gg-field)] px-4">
              <svg viewBox="0 0 24 24" className="size-[18px] shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4 4" />
              </svg>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 찾기" aria-label="이름 찾기" className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-muted" data-testid="pw-search" />
            </label>
            <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="목장" className={SELECT} data-testid="pw-group">
              <option value="">모든 목장</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} 목장
                </option>
              ))}
            </select>
            <select value={role} onChange={(e) => setRole(e.target.value as RoleFilter)} aria-label="구분" className={SELECT} data-testid="pw-role">
              {ROLE_FILTERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="상태" className={SELECT} data-testid="pw-status">
              <option value="">모든 상태</option>
              {(Object.keys(PERSON_STATUS_LABELS) as Enums["person_status"][]).map((s) => (
                <option key={s} value={s}>
                  {PERSON_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          {picked.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2.5 bg-[var(--gg-sky-soft)] px-4 py-2.5" data-testid="pw-picked">
              <span className="mr-auto text-[14.5px] font-bold text-[var(--gg-nav-ink)] tabular-nums">{picked.size}명 골랐어요</span>
              <button type="button" onClick={() => setAskOfficer(true)} disabled={busy || linkedPicked.length === 0} className={`${BTN("leaf", "sm")} !h-9 !text-[14px] disabled:opacity-40`} data-testid="pw-officer">
                임원진 맡기기
              </button>
              <button type="button" onClick={() => setPicked(new Set())} className={`${BTN("white", "sm")} !h-9 !text-[14px]`} data-testid="pw-clear">
                선택 풀기
              </button>
            </div>
          ) : result ? (
            <p role="status" className="bg-[var(--gg-leaf-soft)] px-4 py-2.5 text-[14px] font-semibold text-[var(--gg-leaf-ink)]">
              {result}
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-[var(--gg-section)]">
                  <th className="w-11 bg-[var(--gg-tile)] py-2 pl-4">
                    <input
                      type="checkbox"
                      checked={allShown}
                      onChange={() => setPicked(allShown ? new Set() : new Set(shown.map((p) => p.id)))}
                      aria-label="보이는 사람 모두 고르기"
                      className="size-4 accent-[var(--gg-sky-lip)]"
                    />
                  </th>
                  {["이름", "목장", "구분", "훈련 단계", "출생연도 · 성별", "캠퍼스", "계정", "판정 태그"].map((h) => (
                    <th key={h} className="bg-[var(--gg-tile)] px-2.5 py-2 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const on = p.id === selectedId;
                  const cell = `border-b border-[var(--gg-line)] px-2.5 py-2.5 ${on ? "bg-[var(--gg-sky-soft)]" : ""}`;
                  return (
                    <tr key={p.id} className={`${p.status === "left" ? "text-muted" : ""} hover:bg-[var(--gg-tile)]`} aria-selected={on} data-testid="pw-row">
                      <td className={`${cell} pl-4`}>
                        <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} aria-label={`${p.name} 고르기`} className="size-4 accent-[var(--gg-sky-lip)]" />
                      </td>
                      <td className={`${cell} font-semibold whitespace-nowrap`}>
                        <button type="button" onClick={() => open(p.id)} className={`text-left hover:underline ${p.status === "left" ? "line-through" : ""} ${on ? "text-[var(--gg-nav-ink)]" : ""}`} data-testid="pw-name">
                          {p.name}
                        </button>
                        {p.is_officer ? <span className="ml-1.5 rounded-full bg-[var(--gg-sky-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--gg-sky-ink)]">임원진</span> : null}
                      </td>
                      <td className={`${cell} whitespace-nowrap`}>{p.group_id ? (groupName.get(p.group_id) ?? "") : ""}</td>
                      <td className={`${cell} whitespace-nowrap`}>{memberRoleLabel(p.group_role, p.is_group_head)}</td>
                      <td className={`${cell} whitespace-nowrap text-[var(--gg-section)]`}>{p.training_stage ?? "—"}</td>
                      <td className={`${cell} whitespace-nowrap tabular-nums text-[var(--gg-section)]`}>{[p.birth_year, p.gender ? GENDER_LABELS[p.gender] : null].filter(Boolean).join(" · ") || "—"}</td>
                      <td className={`${cell} max-w-[9rem] truncate text-[var(--gg-section)]`}>{p.campus ?? "—"}</td>
                      <td className={`${cell} whitespace-nowrap`}>{p.user_id ? <span className="font-semibold text-[var(--gg-sky-ink)]">연결</span> : <span className="text-[var(--gg-hint)]">—</span>}</td>
                      <td className={`${cell} whitespace-nowrap`}>
                        {p.care_status !== "active" ? <span className="rounded-full bg-[var(--gg-stone-soft)] px-1.5 py-0.5 text-[11.5px] font-semibold text-[var(--gg-stone-ink)]">{CARE_STATUS_LABELS[p.care_status]}</span> : null}
                        {p.status !== "active" ? <span className="ml-1 rounded-full bg-[var(--gg-sun-soft)] px-1.5 py-0.5 text-[11.5px] font-semibold text-[var(--gg-sun-ink)]">{PERSON_STATUS_LABELS[p.status]}</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 ? <p className="py-10 text-center text-[15px] text-muted">해당하는 사람이 없어요</p> : null}
          </div>
        </div>

        <aside
          aria-label="고친 사람"
          className="sticky top-[calc(var(--nn-safe-top)+68px)] max-h-[calc(100dvh-var(--nn-safe-top)-84px)] space-y-4 overflow-y-auto overscroll-contain rounded-[22px] bg-[var(--background)]"
          data-testid="pw-panel"
        >
          {panel ? (
            <PanelDirty.Provider value={reportDirty}>
              <div key={selectedId} className="flex flex-col gap-4">
                {panel}
              </div>
            </PanelDirty.Provider>
          ) : (
            <p className="rounded-[22px] bg-[var(--gg-card)] px-5 py-8 text-center text-[15px] text-muted shadow-[var(--gg-card-shadow)]">이름을 누르면 여기서 고쳐요</p>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={leaveTo !== null}
        title="고친 내용을 버릴까요?"
        body="저장하지 않은 내용이 있어요."
        confirmLabel="버리기"
        danger
        onConfirm={() => {
          const to = leaveTo;
          setLeaveTo(null);
          setDirty(false);
          if (to) router.replace(to, { scroll: false });
        }}
        onCancel={() => setLeaveTo(null)}
        testId="pw-leave"
      />
      <ConfirmDialog
        open={askOfficer}
        title={`${linkedPicked.length}명에게 임원진을 맡길까요?`}
        body={pickedPeople.length > linkedPicked.length ? `계정이 없거나 이미 임원진인 ${pickedPeople.length - linkedPicked.length}명은 건너뛰어요.` : undefined}
        confirmLabel="맡기기"
        busy={busy}
        onConfirm={() => void giveOfficer()}
        onCancel={() => setAskOfficer(false)}
        testId="pw-officer-confirm"
      />
    </div>
  );
}

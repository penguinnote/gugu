import { CARD_LIST, IconCard, ROW_TAG } from "@/components/toss";

export type PushStatusRow = {
  userId: string;
  name: string;
  roleLabel: string;
  groupLabel: string | null;
  devices: number;
  lastSuccess: string | null;
};

/**
 * 미등록(기기 0)이 먼저, 그 안에서는 목장 순(서버가 정렬해 보낸 순서 유지).
 * 토스 결(2026-11-11): 미등록 ⏳ · 등록됨 🔔 이 카드 하나씩, 줄은 이름 · 회색 목장/역할 · 오른쪽 상태. 줄 글자 순서는 그대로 — 테스트가 본다.
 */
export function PushStatusTable({ rows }: { rows: PushStatusRow[] }) {
  if (rows.length === 0) return <p className="text-[15px] text-[var(--gg-hint)]">아직 계정이 없어요.</p>;
  return (
    <div className="flex flex-col gap-4">
      <StatusSection title="미등록" icon="/icons/tossface/u23F3.svg" items={rows.filter((r) => r.devices === 0)} testId="push-unregistered" />
      <StatusSection title="등록됨" icon="/icons/tossface/u1F514.svg" items={rows.filter((r) => r.devices > 0)} testId="push-registered" />
    </div>
  );
}

function StatusSection({ title, icon, items, testId }: { title: string; icon: string; items: PushStatusRow[]; testId: string }) {
  if (items.length === 0) return null;
  return (
    <IconCard icon={icon} title={title} aside={`${items.length}명`}>
      <ul className={CARD_LIST} data-testid={testId}>
        {items.map((r) => (
          <li key={r.userId} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0 truncate text-[15px] font-semibold">
              {r.name}
              <span className="ml-1.5 text-[13px] font-normal text-[var(--gg-hint)]">{r.groupLabel ?? r.roleLabel}</span>
            </span>
            <span className={r.devices === 0 ? `${ROW_TAG} !text-[var(--gg-berry-ink)]` : `${ROW_TAG} !font-normal !text-[var(--gg-hint)]`}>
              {r.devices === 0 ? "미등록" : `기기 ${r.devices}${r.lastSuccess ? ` · ${r.lastSuccess}` : ""}`}
            </span>
          </li>
        ))}
      </ul>
    </IconCard>
  );
}

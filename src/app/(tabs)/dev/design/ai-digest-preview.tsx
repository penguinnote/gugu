"use client";

import { AiDigestSection, type DigestActions } from "@/components/ai-digest";
import type { ShownDigest, ShownItem } from "@/lib/ai/digest";

/**
 * 디자인 확인 — AI 정리 칸(2026-11-08). 개발 서버에서만 열린다. 지어낸 사람 · 목장, 단추는 서버를 부르지 않고 잠깐 기다린 뒤 가짜 정리를 돌려준다.
 *   state=make(기본 — 단추 → 읽는 중 → 정리) | ready(새 보고서 2개 · 다시 만들기) | fail(만들기 실패) | regen-fail | empty | last(다시 만들기 다 씀)
 */
const SRC = "/dev/design?screen=report";
const item = (key: string, text: string, group: string | null): ShownItem => ({
  key,
  text,
  source: group ? { href: SRC, label: `${group} 목장보고서` } : null,
});

function fake(weekKey: string, round: number, extra: Partial<ShownDigest> = {}): ShownDigest {
  return {
    weekKey,
    highlights: [
      item("h:0", "김하늘이 3주째 모임에 오지 못했어요. 리더가 이번 주 따로 만나기로 했어요.", "가온"),
      item("h:1", "이바람이 직장을 옮기면서 주일 예배 시간이 겹친다고 했어요.", "나래"),
      item("h:2", "새가족 박구름이 처음으로 기도제목을 나눴어요.", "다솜"),
      ...(round > 0 ? [item("h:3", "정해가 졸업 논문 심사를 무사히 마쳤다고 알려 왔어요.", "라온")] : []),
    ],
    thanks: [
      item("t:0", "최별의 어머니 수술이 잘 끝났어요.", "가온"),
      item("t:1", "한결이 기다리던 취업 소식을 들었어요.", "마루"),
    ],
    groups: [
      item("g:1", "새 친구가 처음 왔고 다음 주에도 오기로 했어요.", "가온"),
      item("g:2", "카페에서 모여 늦게까지 이야기를 나눴어요.", "나래"),
      item("g:3", "시험 기간이라 짧게 모이고 서로 기도해 줬어요.", "다솜"),
      ...(round > 0 ? [item("g:4", "리더 한 명이 출장이라 한 명이 진행했어요.", "라온")] : []),
    ],
    intercession: [
      item("i:0", "박구름 — 가족과의 관계가 회복되도록", "다솜"),
      item("i:1", "이바람 — 새 직장에 잘 적응하고 예배를 지킬 수 있도록", "나래"),
      item("i:2", "김하늘 — 지친 마음에 쉼이 있도록", "가온"),
      item("i:3", "윤슬 — 이사할 집이 잘 구해지도록", "마루"),
      item("i:4", "한결 — 첫 출근을 앞두고 떨리는 마음", "마루"),
    ],
    empty: false,
    feedback: round === 0 ? { "h:0": { helpful: true, wrong: false } } : {},
    basis: round === 0 ? "6개 목장 중 4개 기준 · 수요일 08:12" : "6개 목장 중 5개 기준 · 목요일 21:40",
    generatedAt: round === 0 ? "2026-11-11T23:12:00Z" : "2026-11-12T12:40:00Z",
    regenLeft: 3 - round,
    lastFail: null,
    ...extra,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AiDigestPreview({ state, weekKey }: { state: string; weekKey: string }) {
  const first = fake(weekKey, 0);
  const actions: DigestActions = {
    make: async () => {
      await wait(1800);
      if (state === "fail") return null;
      return fake(weekKey, 0);
    },
    regen: async () => {
      await wait(1800);
      return state === "regen-fail" ? first : fake(weekKey, 1);
    },
    feedback: async () => {
      await wait(200);
      return { ok: true };
    },
  };

  if (state === "make" || state === "fail") {
    return <AiDigestSection weekKey={weekKey} initial={null} canMake unread={4} fresh={0} actions={actions} />;
  }
  if (state === "empty") {
    const empty: ShownDigest = { ...first, highlights: [], thanks: [], groups: [], intercession: [], empty: true, feedback: {}, basis: "6개 목장 중 1개 기준 · 수요일 08:12" };
    return <AiDigestSection weekKey={weekKey} initial={empty} canMake={false} unread={0} fresh={0} actions={actions} />;
  }
  if (state === "last") {
    return <AiDigestSection weekKey={weekKey} initial={fake(weekKey, 0, { regenLeft: 0 })} canMake={false} unread={1} fresh={1} actions={actions} />;
  }
  // ready · regen-fail — 만든 뒤 보고서 2개가 더 들어왔다
  return <AiDigestSection weekKey={weekKey} initial={first} canMake={false} unread={2} fresh={2} actions={actions} />;
}

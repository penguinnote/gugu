import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MENU_ICON, allMenuFor, searchMenu } from "@/lib/all-menu";
import { worldReportHref } from "@/lib/home-shortcuts";

/**
 * '전체' 탭(2026-11-10) — 홈 바로가기 칸을 없애고 갈 곳을 모두 모은 메뉴(토스 '전체' 처럼).
 *   · 역할마다 갈 수 있는 화면만, 같은 화면이 두 번 나오지 않는다. 상점 · 내 정보는 모두에게
 *   · 아이콘은 토스페이스 원본 SVG(파일이 있고, 저작권 안내 · 라이선스 전문이 함께 있다)
 *   · 검색 — 이름 · 회색 글씨 · 묶음 제목, 띄어쓰기 무시. 없으면 '찾는 메뉴가 없어요'
 *   · 월드의 '보고서 쓰기' 갈 곳은 그대로(lib/home-shortcuts)
 */
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} data-testid="all-icon" />
  ),
}));
const { AllMenu } = await import("@/app/(tabs)/all/all-menu");

const WEEK = "2026-10-04";
type Me = Parameters<typeof allMenuFor>[0];
const LEADER: Me = { role: "leader", leadsGroup: true };
const ADMIN_LEADER: Me = { role: "admin", leadsGroup: true };
const PASTOR: Me = { role: "pastor", leadsGroup: false };
const ADMIN: Me = { role: "admin", leadsGroup: false };
const OFFICER: Me = { role: "officer", leadsGroup: false };
const hrefs = (me: Me) => allMenuFor(me).flatMap((s) => s.items.map((it) => it.href));
const titles = (me: Me) => allMenuFor(me).map((s) => s.title);

describe("전체 메뉴 — 역할별", () => {
  const WORLD = ["/world", "/shop", "/world?open=dress"];

  it("리더 — 목장(우리 목장 명단이 맨 위, 내보내기 ↔ 지난 보고서, 2026-11-15) · 로뎀 월드 · 나 ★", () => {
    expect(titles(LEADER)).toEqual(["목장", "로뎀 월드", "나"]);
    expect(allMenuFor(LEADER, { week: WEEK }).flatMap((s) => s.items.map((it) => it.href))).toEqual([
      "/groups/members", `/reports/${WEEK}`, "/export", "/groups/people", "/groups/care", "/attendance", "/campus", "/reports", "/groups/roster", "/groups/profiles",
      ...WORLD, "/me", "/me/push", "/me/consent", "/auth/signout",
    ]);
  });

  it("구구 AI 가 켜져 있으면 리더 · 목사님 맨 위 '구구에게 물어보기', 받아쓰기 · AI 요약은 회색 글씨로 알린다", () => {
    const s = allMenuFor(LEADER, { ai: true, week: WEEK });
    expect(s[0].items[0].href).toBe("/gugu");
    const items = s.flatMap((x) => x.items);
    expect(items.find((it) => it.href === `/reports/${WEEK}`)?.hint).toContain("기도제목 붙여넣기");
    expect(items.find((it) => it.href === "/groups/people")?.hint).toContain("AI 요약");
    expect(allMenuFor(LEADER).flatMap((x) => x.items).find((it) => it.href === "/groups/people")?.hint).not.toContain("AI");
  });

  it("운영자 겸 리더 — 리더 메뉴에 운영(운영 화면 전부 · 계정 권한 · 명단), 승인 대기 수는 빨간 숫자", () => {
    const s = allMenuFor(ADMIN_LEADER, { pending: 3 });
    expect(s.map((x) => x.title)).toEqual(["목장", "운영", "로뎀 월드", "나"]);
    expect(s[1].items.map((it) => it.href)).toEqual(["/admin", "/approvals", "/admin/weeks", "/admin/push", "/admin/exports", "/admin/accounts", "/admin/people", "/admin/people/new", "/admin/people/ai-consent"]);
    expect(s[1].items[1].badge).toBe(3);
    expect(allMenuFor(ADMIN_LEADER)[1].items[1].badge).toBeUndefined();
  });

  it("목사님 — 제출 현황의 칸마다 바로 가는 줄(AI 정리는 켜졌을 때만) · 출석/기도제목 기록 보기 · 내려받기 · 내보내기 기록(2026-11-26) · 휴주는 운영자만(2026-11-18) ★", () => {
    expect(hrefs(PASTOR)).toEqual([
      "/pastor", "/pastor#prayers", "/pastor#care", "/pastor#absences", "/groups/people", "/export", "/admin/exports",
      "/groups/roster", "/attendance", "/campus", "/groups/members", "/groups/profiles", ...WORLD, "/me", "/me/push", "/me/consent", "/auth/signout",
    ]);
    expect(allMenuFor(PASTOR, { digest: true }).flatMap((x) => x.items.map((it) => it.href))).toContain("/pastor#ai");
  });

  it("운영자(명단 밖) — 운영 화면 전부 · 명단, 보고서 · 지난 보고서 · 출석/기도제목 기록 보기는 없다", () => {
    expect(hrefs(ADMIN)).toEqual([
      "/admin", "/approvals", "/admin/weeks", "/admin/push", "/admin/exports", "/admin/accounts",
      "/admin/people", "/admin/people/new", "/admin/people/ai-consent", "/groups/roster", "/attendance", "/campus", "/groups/members", "/groups/profiles", ...WORLD, "/me", "/me/push", "/me/consent", "/auth/signout",
    ]);
  });

  it("임원진 — 전체 명단 · 목장 프로필 · 로뎀 월드 · 내 정보", () => {
    expect(hrefs(OFFICER)).toEqual(["/groups/roster", "/groups/profiles", "/attendance", "/campus", ...WORLD, "/me", "/me/consent", "/auth/signout"]);
  });

  it("임원진을 겸한 리더 — 전체 명단이 '임원진' 칸으로 옮겨 가고(전체 엑셀), 나머지는 리더 그대로 (2026-11-12)", () => {
    const s = allMenuFor({ ...LEADER, isOfficer: true }, { week: WEEK });
    expect(s.map((x) => x.title)).toEqual(["목장", "임원진", "로뎀 월드", "나"]);
    expect(s.find((x) => x.title === "임원진")?.items.map((it) => [it.href, it.hint])).toEqual([["/groups/roster", "모든 목장 · 전체 명단 엑셀"]]);
    expect(s[0].items.map((it) => it.href)).toContain("/campus"); // 캠퍼스 모임은 목장 칸에(2026-11-26 모두 공개)
    expect(s[0].items.map((it) => it.href)).not.toContain("/groups/roster");
    const all = s.flatMap((x) => x.items.map((it) => it.href));
    expect(new Set(all).size).toBe(all.length);
  });

  it("정보 탭에서 옮겨 온 알림 — 받는 알림을 회색 글씨로, 리더 아닌 임원진은 없다 (2026-11-10)", () => {
    const push = (me: Parameters<typeof allMenuFor>[0]) => allMenuFor(me).flatMap((x) => x.items).find((it) => it.href === "/me/push")?.hint;
    expect(push(LEADER)).toBe("월요일 미제출 · 목장 이동 · 새가족");
    expect(push(PASTOR)).toBe("수요일 정리 · 목장보고서 제출 · 목장 이동 · 새가족");
    expect(push(ADMIN)).toBe("새 신청");
    expect(push(ADMIN_LEADER)).toBe("새 신청");
    expect(push(OFFICER)).toBeUndefined();
  });

  it("같은 화면이 두 번 나오지 않고, 모든 줄에 회색 글씨가 있다", () => {
    for (const me of [LEADER, ADMIN_LEADER, PASTOR, ADMIN, OFFICER]) {
      const all = allMenuFor(me, { ai: true, digest: true, week: WEEK });
      const list = all.flatMap((s) => s.items.map((it) => it.href));
      expect(new Set(list).size).toBe(list.length);
      expect(all.every((s) => s.items.every((it) => it.hint.length > 0))).toBe(true);
    }
  });

  it("아이콘은 토스페이스 원본 파일이 다 있고, 저작권 안내 · 라이선스 전문이 함께 있다", () => {
    for (const src of Object.values(MENU_ICON)) expect(existsSync(join(process.cwd(), "public", src)), src).toBe(true);
    const credits = readFileSync(join(process.cwd(), "public/icons/tossface/CREDITS.txt"), "utf8");
    expect(credits).toContain("토스페이스 저작권 안내");
    expect(credits).toContain("토스페이스 라이선스 전문");
  });

  it("월드의 보고서 쓰기 — 리더는 이번 주 작성 화면, 목사님은 제출 현황, 그 밖은 없음", () => {
    expect(worldReportHref({ role: "leader", leadsGroup: true }, WEEK)).toBe(`/reports/${WEEK}`);
    expect(worldReportHref({ role: "pastor", leadsGroup: false }, WEEK)).toBe("/pastor");
    expect(worldReportHref({ role: "admin", leadsGroup: false }, WEEK)).toBeNull();
    expect(worldReportHref({ role: "officer", leadsGroup: false }, WEEK)).toBeNull();
  });
});

describe("검색", () => {
  it("이름 · 회색 글씨 · 묶음 제목에서, 띄어쓰기 무시", () => {
    const s = allMenuFor(ADMIN);
    expect(searchMenu(s, "명단").flatMap((x) => x.items.map((it) => it.label))).toEqual(["명단", "새 사람 추가", "AI 동의", "전체 명단", "출석부", "캠퍼스 모임", "명단 고치기", "목장 프로필"]);
    expect(searchMenu(s, "엑 셀").flatMap((x) => x.items.map((it) => it.label))).toEqual(["전체 명단", "출석부"]);
    expect(searchMenu(s, "")).toBe(s);
    expect(searchMenu(s, "없는말")).toEqual([]);
  });
});

describe("AllMenu 화면", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("로그아웃 — 누르면 확인 창, 취소하면 닫힌다(2026-11-11)", async () => {
    await act(async () => root.render(<AllMenu name="김가온" sections={allMenuFor(LEADER)} />));
    expect(container.querySelector('[data-testid="logout-confirm"]')).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="logout-item"]')!.click());
    const box = container.querySelector('[data-testid="logout-confirm"]')!;
    expect(box.textContent).toContain("로그아웃할까요?");
    expect(box.querySelector('form[action="/auth/signout"]')).not.toBeNull();
    await act(async () => [...box.querySelectorAll("button")].find((b) => b.textContent === "취소")!.click());
    expect(container.querySelector('[data-testid="logout-confirm"]')).toBeNull();
  });

  it("이름 · 묶음 · 줄(아이콘 alt 빈칸 · 이름 · 회색 글씨) · 배지, 검색하면 줄이 걸러지고 없으면 안내", async () => {
    await act(async () => root.render(<AllMenu name="김가온" sections={allMenuFor(ADMIN_LEADER, { pending: 2 })} />));
    expect(container.querySelector("h1")?.textContent).toBe("김가온");
    expect([...container.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["목장", "운영", "로뎀 월드", "나"]);
    const items = container.querySelectorAll("[data-testid=all-item]");
    expect(items).toHaveLength(24);
    expect(items[0].textContent).toBe("우리 목장 명단사람 더하기 · 고치기 · 상태");
    expect([...container.querySelectorAll<HTMLImageElement>("[data-testid=all-icon]")].every((i) => i.getAttribute("alt") === "")).toBe(true);
    expect(container.querySelector("[data-testid=all-badge]")?.textContent).toBe("2");

    const input = container.querySelector<HTMLInputElement>("[data-testid=all-search]")!;
    const type = async (v: string) => {
      await act(async () => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        set.call(input, v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await type("상점");
    expect([...container.querySelectorAll("[data-testid=all-item]")].map((a) => a.getAttribute("href"))).toEqual(["/shop"]);
    await type("아무것도");
    expect(container.querySelector("[data-testid=all-empty]")?.textContent).toBe("찾는 메뉴가 없어요");
  });
});

describe("전체 명단 — '확인 필요' 는 뺐다(2026-11-11)", () => {
  it("운영자에게도 전체 명단 줄은 그냥 회색 글씨", () => {
    const roster = (s: ReturnType<typeof allMenuFor>) => s.flatMap((x) => x.items).find((it) => it.href === "/groups/roster");
    expect(roster(allMenuFor({ role: "admin", leadsGroup: false }))).toMatchObject({ hint: "모든 목장 · 엑셀" });
    expect(roster(allMenuFor({ role: "admin", leadsGroup: true }))?.warn).toBeUndefined();
  });
});

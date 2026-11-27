import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canEditProfile,
  ddayState,
  nearestDDay,
  normalizeProfileInput,
  parseDDays,
  parseThemeSongs,
  sortMembers,
  upcomingDDays,
} from "@/lib/group-profile";

/**
 * L-5 목장 프로필 (Step 8) — 순수 계산과 화면 배선.
 *
 *   · 디데이: 오늘 기준은 서버가 넘긴 KST 날짜. D-DAY · D-n · 지난 것은 보기 화면에서 빠진다
 *   · jsonb 는 믿지 않는다 — 꼴이 아닌 원소는 버린다. javascript: 링크는 화면에 오르지 않는다
 *   · 멤버 목록 순서: 목장장 → 리더 → 청년, 이름순. 상태(휴면·기록 제외)는 어떤 식으로도 안 보인다
 *   · 편집 폼: 반쯤 채운 줄은 막고, 저장은 액션에 넘기고, 충돌이면 버튼이 잠긴다
 */

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push, refresh }) })); // 저장 뒤 이동은 갈아 끼우기(replace) — 같은 가짜로 받는다
const saveGroupProfile = vi.fn();

const { ProfileForm } = await import("@/app/(tabs)/groups/[name]/edit/profile-form");
const { ProfileView } = await import("@/app/(tabs)/groups/[name]/profile-view");
const { GroupCards } = await import("@/app/(tabs)/groups/group-cards");

const TODAY = "2026-10-05";

describe("디데이 계산", () => {
  it("D-DAY · D-n · 지남", () => {
    expect(ddayState("2026-10-05", TODAY)).toMatchObject({ kind: "today", label: "D-DAY" });
    expect(ddayState("2026-10-17", TODAY)).toMatchObject({ kind: "future", label: "D-12" });
    expect(ddayState("2026-10-04", TODAY)).toMatchObject({ kind: "past", label: "지남" });
    // 월말·연말을 넘어도 날짜 자체로 센다
    expect(ddayState("2027-01-01", "2026-12-31").label).toBe("D-1");
  });

  it("오늘 이후만 가까운 순으로, 가장 가까운 것 하나", () => {
    const ddays = [
      { title: "수련회", date: "2026-12-19" },
      { title: "지난 MT", date: "2026-09-01" },
      { title: "오늘", date: "2026-10-05" },
      { title: "MT", date: "2026-11-07" },
    ];
    expect(upcomingDDays(ddays, TODAY).map((d) => d.title)).toEqual(["오늘", "MT", "수련회"]);
    expect(nearestDDay(ddays, TODAY)?.title).toBe("오늘");
    expect(nearestDDay([{ title: "지난", date: "2026-01-01" }], TODAY)).toBeNull();
  });
});

describe("jsonb 방어", () => {
  it("꼴이 아닌 원소는 버린다", () => {
    expect(parseDDays([{ title: "MT", date: "2026-11-07" }, { title: "날짜 없음" }, "x", null, { title: " ", date: "2026-11-07" }])).toEqual([
      { title: "MT", date: "2026-11-07" },
    ]);
    expect(parseDDays("not array")).toEqual([]);
  });

  it("http(s) 가 아닌 링크는 화면에 오르지 않는다 ★", () => {
    expect(
      parseThemeSongs([
        { title: "주 안에", url: "https://example.invalid/a" },
        { title: "나쁜 링크", url: "javascript:alert(1)" },
        { title: "링크 없음" },
      ]),
    ).toEqual([{ title: "주 안에", url: "https://example.invalid/a" }]);
  });
});

describe("멤버 순서와 편집 권한", () => {
  it("목장장 → 리더 → 청년, 각각 이름순", () => {
    const rows = [
      { id: "1", name: "하늘", group_role: "member" as const, is_group_head: false },
      { id: "2", name: "나래", group_role: "leader" as const, is_group_head: false },
      { id: "3", name: "가온", group_role: "member" as const, is_group_head: false },
      { id: "4", name: "하람", group_role: "leader" as const, is_group_head: true },
      { id: "5", name: "다솜", group_role: "leader" as const, is_group_head: false },
    ];
    expect(sortMembers(rows).map((r) => r.name)).toEqual(["하람", "나래", "다솜", "가온", "하늘"]);
  });

  it("자기 목장 리더 · 목사님만 고친다. 운영자는 2026-11-26 뺐다(운영자 겸 리더는 리더로서 자기 목장만) ★", () => {
    expect(canEditProfile({ leadsGroup: true, groupId: "g1", role: "leader" }, "g1")).toBe(true);
    expect(canEditProfile({ leadsGroup: true, groupId: "g1", role: "leader" }, "g2")).toBe(false);
    expect(canEditProfile({ leadsGroup: false, groupId: null, role: "pastor" }, "g2")).toBe(true);
    expect(canEditProfile({ leadsGroup: false, groupId: null, role: "admin" }, "g2")).toBe(false);
    expect(canEditProfile({ leadsGroup: true, groupId: "g1", role: "admin" }, "g1")).toBe(true);
    expect(canEditProfile({ leadsGroup: true, groupId: "g1", role: "admin" }, "g2")).toBe(false);
    expect(canEditProfile({ leadsGroup: false, groupId: null, role: "pending" }, "g2")).toBe(false);
  });
});

describe("입력 정규화 — 서버와 폼이 같은 함수", () => {
  it("빈 줄은 버리고 반쯤 채운 줄은 막는다", () => {
    const base = { intro: "  소개  ", freeText: "", ddays: [{ title: "", date: "" }], themeSongs: [{ title: "", url: "" }] };
    expect(normalizeProfileInput(base)).toEqual({ ok: true, value: { intro: "소개", freeText: null, ddays: [], themeSongs: [] } });
    expect(normalizeProfileInput({ ...base, ddays: [{ title: "MT", date: "" }] })).toMatchObject({ ok: false, message: expect.stringContaining("날짜") });
    expect(normalizeProfileInput({ ...base, ddays: [{ title: "", date: "2026-11-07" }] })).toMatchObject({ ok: false, message: expect.stringContaining("제목") });
    expect(normalizeProfileInput({ ...base, themeSongs: [{ title: "x", url: "youtube.com/abc" }] })).toMatchObject({
      ok: false,
      message: expect.stringContaining("https://"),
    });
    expect(normalizeProfileInput({ ...base, intro: "가".repeat(101) })).toMatchObject({ ok: false });
    expect(normalizeProfileInput({ ...base, ddays: Array.from({ length: 11 }, () => ({ title: "t", date: "2026-12-01" })) })).toMatchObject({ ok: false });
  });
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  push.mockReset();
  refresh.mockReset();
  vi.mocked(saveGroupProfile).mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(el: React.ReactElement) {
  await act(async () => {
    root.render(el);
  });
}

const members = [
  { id: "m1", name: "하늘", group_role: "member" as const, is_group_head: false },
  { id: "l1", name: "나래", group_role: "leader" as const, is_group_head: false },
  { id: "l2", name: "하람", group_role: "leader" as const, is_group_head: true },
];

describe("프로필 보기", () => {
  it("빈 블록은 숨기고, 다 비면 한 줄과 '채우기'", async () => {
    await render(
      <ProfileView
        blocks={{ intro: null, freeText: null, ddays: [], themeSongs: [] }}
        members={members}
        today={TODAY}
        editHref="/groups/x/edit"
      />,
    );
    expect(container.querySelector('[data-testid="empty"]')?.textContent).toContain("아직 목장 소개가 없습니다");
    expect([...container.querySelectorAll("a")].some((a) => a.textContent === "채우기")).toBe(true);
    expect(container.querySelector('[data-testid="ddays"]')).toBeNull();
    expect(container.querySelector('[data-testid="songs"]')).toBeNull();
    expect(container.querySelector('[data-testid="free-text"]')).toBeNull();
    // 멤버는 프로필이 비어도 자동으로 나온다 — 목장장 먼저
    // 사람 알약(2026-11-11 A안) — 동그라미(사진 · 성) + 이름. 목장장 표시는 리더 알약에
    const names = (sel: string) => [...container.querySelectorAll(`${sel} [data-testid="person-name"]`)].map((n) => n.textContent);
    expect(names('[data-testid="leaders"]')).toEqual(["하람", "나래"]);
    expect(names('[data-testid="youths"]')).toEqual(["하늘"]);
    // 동그라미 글자는 성(2026-11-18 사용자 — 예전엔 이름 둘째 글자)
    expect([...container.querySelectorAll('[data-testid="leaders"] a > span[aria-hidden]')].map((n) => n.textContent)).toEqual(["하", "나"]);
    // 목장장은 글씨 없이 연한 갈색 이름표(2026-11-11) — 화면 읽기에만 '(목장장)'
    expect(container.querySelectorAll('[data-testid="leaders"] [data-head]').length).toBe(1);
  });

  it("채워진 블록만 보이고, 지난 디데이는 빠지고, 고칠 수 없으면 링크가 없다", async () => {
    await render(
      <ProfileView
        blocks={{
          intro: "셋이 시작한 목장",
          freeText: "첫 줄\n둘째 줄",
          ddays: [
            { title: "지난 MT", date: "2026-09-01" },
            { title: "수련회", date: "2026-12-19" },
            { title: "MT", date: "2026-11-07" },
          ],
          themeSongs: [{ title: "주 안에", url: "https://example.invalid/a" }],
        }}
        members={members}
        today={TODAY}
        editHref={null}
      />,
    );
    expect(container.querySelector('[data-testid="empty"]')).toBeNull();
    const dd = [...container.querySelectorAll('[data-testid="ddays"] li')].map((li) => li.textContent);
    expect(dd).toEqual(["D-33MT11월 7일", "D-75수련회12월 19일"]);
    const a = container.querySelector<HTMLAnchorElement>('[data-testid="songs"] a')!;
    expect(a.getAttribute("href")).toBe("https://example.invalid/a");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(container.querySelector('[data-testid="free-text"]')?.textContent).toBe("첫 줄\n둘째 줄");
    expect([...container.querySelectorAll("a")].some((a) => a.textContent === "프로필 고치기")).toBe(false);
  });
});

describe("목장 페이지 순서 · 찬양 · 기본 색(2026-11-14, 요절 칸은 2026-11-18 화면에서 뺌)", () => {
  it("함께하는 사람 · 찬양 — 찬양은 비어 있어도 칸이 있고, 요절 칸은 없다 ★", async () => {
    await render(<ProfileView blocks={{ intro: null, freeText: null, ddays: [], themeSongs: [] }} members={members} today={TODAY} editHref={null} />);
    const titles = [...container.querySelectorAll("section h2")].map((h) => h.textContent);
    expect(titles).toEqual(["함께하는 사람", "찬양"]);
    expect(container.querySelector('[data-testid="verse-empty"]')).toBeNull();
    expect(container.querySelector('[data-testid="songs-empty"]')?.textContent).toBe("아직 찬양이 없어요.");
  });

  it("저장된 요절이 있어도 보이지 않는다, 디데이는 사람 다음 · 찬양 앞", async () => {
    await render(
      <ProfileView
        blocks={{ verse: "서로 사랑하라 (요한복음 13:34)", intro: null, freeText: null, ddays: [{ title: "MT", date: "2026-11-07" }], themeSongs: [] }}
        members={members}
        today={TODAY}
        editHref={null}
      />,
    );
    expect(container.textContent).not.toContain("서로 사랑하라");
    expect([...container.querySelectorAll("section h2")].map((h) => h.textContent)).toEqual(["함께하는 사람", "디데이", "찬양"]);
  });

  it("사진 없는 동그라미 — 목장장 갈색 · 리더 연두 · 양은 노랑이나 주황", async () => {
    await render(<ProfileView blocks={{ intro: null, freeText: null, ddays: [], themeSongs: [] }} members={members} today={TODAY} editHref={null} />);
    const dot = (name: string) => {
      const pill = [...container.querySelectorAll("a")].find((a) => a.querySelector('[data-testid="person-name"]')?.textContent === name)!;
      return (pill.querySelector("span[aria-hidden]") as HTMLElement).style.background;
    };
    expect(dot("하람")).toBe("rgb(168, 120, 79)");
    expect(dot("나래")).toBe("rgb(127, 177, 28)");
    expect(["rgb(232, 181, 47)", "rgb(240, 151, 90)"]).toContain(dot("하늘"));
  });
});

describe("전체 목장 카드", () => {
  it("명단 순서 그대로, 우리 목장 표시, 가장 가까운 디데이 하나", async () => {
    await render(
      <GroupCards
        today={TODAY}
        myGroupId="g2"
        groups={[
          { id: "g1", name: "가온", leaders: 4, members: 3, intro: null, ddays: [] },
          { id: "g2", name: "나래", leaders: 3, members: 5, intro: "둘째", ddays: [{ title: "MT", date: "2026-11-07" }, { title: "수련회", date: "2026-12-19" }] },
        ]}
      />,
    );
    const cards = [...container.querySelectorAll('[data-testid="group-cards"] li')];
    expect(cards.map((c) => c.querySelector("a")?.getAttribute("href"))).toEqual([`/groups/${encodeURIComponent("가온")}`, `/groups/${encodeURIComponent("나래")}`]);
    expect(cards[0].textContent).toContain("리더 4 · 양 3");
    expect(cards[0].textContent).not.toContain("우리 목장");
    expect(cards[1].textContent).toContain("우리 목장");
    expect(cards[1].textContent).toContain("D-33 MT");
    expect(cards[1].textContent).not.toContain("수련회");
  });
});

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function byLabel<T extends HTMLElement = HTMLInputElement>(label: string): T {
  const el = container.querySelector<T>(`[aria-label="${label}"]`);
  if (!el) throw new Error(`없음: ${label}`);
  return el;
}

function saveButton(): HTMLButtonElement {
  const b = [...container.querySelectorAll("button")].find((b) => /^(저장|저장 중…)$/.test(b.textContent?.trim() ?? ""));
  if (!b) throw new Error("저장 버튼이 없다");
  return b;
}

const FORM_PROPS = {
  initial: { intro: "", freeText: "", ddays: [], themeSongs: [] },
  expectedUpdatedAt: null,
  today: TODAY,
  save: saveGroupProfile,
  doneHref: `/groups/${encodeURIComponent("가온")}`,
};

describe("프로필 편집 폼", () => {
  it("반쯤 채운 디데이는 저장하지 않고 알린다 — 액션이 불리지 않는다", async () => {
    await render(<ProfileForm {...FORM_PROPS} />);
    await act(async () => setValue(byLabel("디데이 1 제목"), "목장 MT"));
    await act(async () => saveButton().click());
    expect(vi.mocked(saveGroupProfile)).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("날짜");
  });

  it("저장하면 액션에 그대로 넘기고 프로필로 돌아간다 ★", async () => {
    vi.mocked(saveGroupProfile).mockResolvedValue({ ok: true, updatedAt: "2026-10-05T10:00:00+00:00" });
    await render(<ProfileForm {...FORM_PROPS} />);

    await act(async () => setValue(container.querySelector("#intro")!, " 셋이 시작한 목장 "));
    await act(async () => setValue(byLabel("디데이 1 제목"), "목장 MT"));
    await act(async () => setValue(byLabel("디데이 1 날짜"), "2026-11-07"));
    // 둘째 디데이 줄을 추가했다가 지운다
    await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === "+ 디데이 추가")!.click());
    expect(container.querySelectorAll('[data-testid="dday-row"]').length).toBe(2);
    await act(async () => byLabel<HTMLButtonElement>("디데이 2 삭제").click());
    expect(container.querySelectorAll('[data-testid="dday-row"]').length).toBe(1);
    await act(async () => setValue(byLabel("찬양 1 제목"), "주 안에"));
    await act(async () => setValue(byLabel("찬양 1 링크"), "https://example.invalid/a"));
    await act(async () => setValue(container.querySelector("#free-text")!, "첫 줄"));

    await act(async () => saveButton().click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(vi.mocked(saveGroupProfile)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveGroupProfile).mock.calls[0][0]).toMatchObject({
      expectedUpdatedAt: null,
      intro: " 셋이 시작한 목장 ",
      ddays: [{ title: "목장 MT", date: "2026-11-07" }],
      themeSongs: [{ title: "주 안에", url: "https://example.invalid/a" }],
      freeText: "첫 줄",
    });
    // 저장 뒤 이동은 입력 화면의 지킴 칸(나가기 경고)이 걷힌 뒤에(2026-11-06). 저장이 끝나도 지킴 칸을 다시 얹지 않으므로
    // 1.5초 상한을 기다리지 않고 곧바로 떠난다 — 다시 얹으면 이동할 때 그 칸이 남아 있다(2026-11-10)
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/groups/${encodeURIComponent("가온")}`));
    expect((history.state as { ggGuard?: string } | null)?.ggGuard).toBeUndefined();
  });

  it("충돌이면 알리고 버튼이 잠긴다 — 조용히 덮어쓰지 않는다 ★", async () => {
    vi.mocked(saveGroupProfile).mockResolvedValue({ ok: false, conflict: true, message: "다른 리더가 방금 고쳤습니다. 다시 열어 주세요." });
    await render(<ProfileForm {...FORM_PROPS} expectedUpdatedAt="2026-10-05T09:00:00+00:00" initial={{ ...FORM_PROPS.initial, intro: "원래" }} />);
    await act(async () => setValue(container.querySelector("#intro")!, "고침"));
    await act(async () => saveButton().click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("다시 열어 주세요");
    expect(saveButton().getAttribute("aria-disabled")).toBe("true");
    await act(async () => saveButton().click());
    expect(vi.mocked(saveGroupProfile)).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("지난 디데이는 편집 화면에서 '지남' 으로 보여 지울 수 있다", async () => {
    await render(<ProfileForm {...FORM_PROPS} initial={{ ...FORM_PROPS.initial, ddays: [{ title: "지난 MT", date: "2026-09-01" }] }} />);
    expect(container.querySelector('[data-testid="dday-row"]')?.textContent).toContain("지남");
  });
});

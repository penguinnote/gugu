import type { Metadata, Viewport } from "next";

import { roundFont } from "@/app/fonts";
import { requireAppUser } from "@/lib/auth/session";
import { worldReportHref } from "@/lib/home-shortcuts";
import { createClient } from "@/lib/supabase/server";
import { WORLD_SKY } from "@/lib/system-bar";
import { ITEM_ID, loadWorldState, toPayload } from "@/lib/world-state";
import { currentWeekKey } from "@/lib/week";
import { freshShotAt } from "@/lib/room-shot";

import { WorldShell, type WorldInit } from "./world-shell";

export const metadata: Metadata = {
  title: "로뎀 월드 · 구구",
};

// 월드는 화면을 꽉 채운다 — 아이폰 노치·홈 막대 밑까지 그리고, 조작 단추는 월드 쪽이 안전 영역을 피한다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // 월드는 화면 끝까지 그린다(디자인 2) — 브라우저 막대 자리 색도 하늘색으로. 월드는 늘 낮이라 밝기와 상관없이 한 색(2026-11-09)
  themeColor: WORLD_SKY,
};

/**
 * /world — 로뎀 월드(World 1, 2026-10-08). 탭바 없는 전체 화면. 승인된 사용자(리더·목사님·운영자)만.
 * 월드 본체는 아직 디자인 시안(public/rodem-world/, three.js 한 파일)이라 같은 출처 iframe 으로 띄운다 —
 * 앱의 스타일·전역과 섞이지 않고, 앱은 불러오기 화면·나가기·보고서 연결만 맡는다(world-shell.tsx).
 * World 4(2026-10-11)부터 월드에 실제 정보를 넘긴다(WorldInit): 활동 중인 목장 이름 12곳(번호 순 — 월드의 마을 자리 순서),
 * 내 목장(명단상 리더만, 그 외 -1), 이번 주 우리 목장 보고서 상태. 읽기만 한다 — 보고서 행을 만들지 않는다(select 뿐).
 * 2단계(World 4 DB, 2026-10-11): 열매·가진 물건·모든 마을 꾸밈·내 생김새도 함께(world_state). 사기·꾸미기·생김새 저장은
 * 월드가 부탁하면 껍데기가 서버 액션(actions.ts)으로 부르고 새 상태를 돌려준다.
 */
export default async function WorldPage({ searchParams }: PageProps<"/world">) {
  const me = await requireAppUser();
  const sp = await searchParams;
  const weekKey = currentWeekKey();
  const supabase = await createClient();
  const [groupsRes, reportRes, skippedRes, world, shotRes, avatarRes] = await Promise.all([
    // 목장 12곳 뒤에 목회자 · 운영자 집(특별 자리, 번호 101 · 102 — 2026-11-06)
    supabase.from("groups").select("id, name, status").in("status", ["active", "special"]).order("number"),
    me.leadsGroup && me.groupId
      ? supabase.from("reports").select("submitted_at").eq("group_id", me.groupId).eq("week_key", weekKey).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("skipped_weeks").select("week_key").eq("week_key", weekKey).maybeSingle(),
    loadWorldState(supabase),
    // 목장 탭 배경(집 안 사진)이 있는지 — 없으면 월드가 한 장 찍어 보낸다
    me.leadsGroup && me.groupId
      ? supabase.from("world_room_shots").select("updated_at").eq("group_id", me.groupId).maybeSingle()
      : Promise.resolve({ data: null }),
    // 정보 탭 배경(내 아바타 사진)이 있는지 — 본인 것만 읽힌다(RLS)
    supabase.from("world_avatar_shots").select("user_id").maybeSingle(),
  ]);
  const groups = groupsRes.data ?? [];
  const groupIds = groups.map((g) => g.id);
  // 내 자리 — 데이터베이스가 정한다(_world_my_group): 리더는 자기 목장, 목사님은 목회자 집, 운영자는 운영자 집
  const mine = world?.mine ? groupIds.indexOf(world.mine.group_id) : -1;
  const ownGroup = mine >= 0 && groups[mine].status === "active";
  const init: WorldInit = {
    groups: groups.map((g) => g.name),
    mine,
    week: ownGroup ? { submitted: Boolean(reportRes.data?.submitted_at), skipped: Boolean(skippedRes.data) } : null,
    world: world ? toPayload(world, groupIds) : null,
    roomShot: ownGroup && !freshShotAt(shotRes.data?.updated_at) ? "need" : null, // 없거나 예전 방 모습이면 새로 한 장(lib/room-shot)
    avatarShot: avatarRes.error || avatarRes.data ? null : "need",
    // ?open=dress — 정보 탭에서 꾸미기로 바로 · ?try=<소품> — 상점 '입어 보기'(꾸미기를 열고 입혀 본다)
    open: sp.open === "dress" ? "dress" : null,
    tryOn: typeof sp.try === "string" && ITEM_ID.test(sp.try) ? sp.try : null,
  };
  // ?stats — 휴대폰에서 무게(초당 장 수·계산 시간·그리기 수·세모 수)를 재는 작은 표를 월드 위에 띄운다
  const stats = "stats" in sp;
  // ?props — 코드로 만든 소품 시험 자리(2026-11-15). 주소에 붙일 때만 — 소품은 이제 상점에서 산다
  const props = "props" in sp;
  return (
    <div className={roundFont.variable}>
      <WorldShell
        reportHref={worldReportHref(me, weekKey)}
        stats={stats}
        props={props}
        init={init}
        groupIds={groupIds}
        // 함께 걷기 — 승인된 사용자만 여기까지 온다(requireAppUser)
        // 이름표 — 명단 이름(2026-11-18). 명단과 이어지지 않은 계정(목사님 · 운영자)은 이름 없이
        // 리더 아닌 임원진(2026-10-30)은 함께 걷기에 넣지 않는다 — 월드 사람은 리더 · 목사님 · 운영자다
        live={me.role === "pending" || me.role === "officer" ? null : { userId: me.userId, role: me.role, name: me.personName }}
      />
    </div>
  );
}

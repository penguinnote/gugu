import type { Metadata } from "next";

import { TabHeader } from "@/components/tab-header";
import { GuguSays } from "@/components/ui";
import { requireAppUser } from "@/lib/auth/session";
import type { WorldSummary } from "@/lib/berries";
import { previewWritesBlocked } from "@/lib/preview-guard";
import { createClient } from "@/lib/supabase/server";
import { loadWorldState } from "@/lib/world-state";

import { ShopView } from "./shop-view";

export const metadata: Metadata = {
  title: "상점 · 구구",
};

/**
 * 상점 탭(World 6) — 로뎀 월드의 물건을 앱 화면에서 고르고 산다. 월드 안 상점과 같은 물건 · 같은 값 · 같은 DB 함수(world_buy).
 *   마을    집 · 울타리 · 나무·꽃 · 놀이·소품 — 사서 월드의 '내 마을' 에서 놓는다
 *   꾸미기  모자 · 얼굴 · 목 · 등 · 손 소품 — 한 번 사면 목장 옷장, 월드의 '꾸미기' 에서 입는다
 *   쿠폰    연속 지키기 쿠폰 — 홈의 '쿠폰으로 지키기' 에서 쓴다
 * 사는 사람은 명단상 목장 리더(목장 열매) · 목사님(목회자 집 열매) · 운영자(운영자 집 열매, 2026-11-06).
 */
export default async function Page() {
  const me = await requireAppUser();
  const supabase = await createClient();
  const [state, summaryRes] = await Promise.all([loadWorldState(supabase), me.leadsGroup ? supabase.rpc("world_summary") : Promise.resolve({ data: null })]);
  const summary = (summaryRes.data as WorldSummary | null) ?? null;

  if (!state) {
    return (
      <>
        <TabHeader title="상점" photo="/home/hd-shop-sym.webp" compact />
        <main className="mx-auto w-full gg-col px-5 pt-5 pb-10">
          <GuguSays mood="sleepy" lines={["상점을 못 불러왔어요.", "잠시 뒤 다시 열어요."]} />
        </main>
      </>
    );
  }
  return (
    <ShopView
      items={state.items}
      owned={state.mine?.owned ?? {}}
      berries={state.mine ? Number(state.mine.berries) : null}
      groupName={me.groupName}
      // 목회자 · 운영자 집은 목장이 아니다 — 리더가 아니면 내 자리는 그 집
      place={state.mine && me.role === "pastor" ? "목회자 집" : state.mine && me.role === "admin" ? "운영자 집" : null}
      couponMax={summary?.coupon_max ?? 2}
      readOnly={previewWritesBlocked()}
      village={(() => {
        const v = state.mine ? state.villages.find((x) => x.group_id === state.mine!.group_id) : null;
        return v ? { slots: v.slots, rooms: v.rooms ?? {} } : null;
      })()}
    />
  );
}

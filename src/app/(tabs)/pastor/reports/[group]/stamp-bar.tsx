"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BTN, ICON, Icon } from "@/components/ui";
import type { Database } from "@/lib/supabase/database.types";
import { REPORT_STAMPS, REPORT_STAMP_LABELS } from "@/lib/labels";

import { setStamp } from "../../actions";

type Stamp = Database["public"]["Enums"]["report_stamp"];

/**
 * 맨 밑 스탬프 바(2026-10-23부터 화면에 고정하지 않는다) — 버튼 하나("기도하겠습니다"). 누르면 찍히고 **곧바로 다음 목장**으로 간다.
 * 마지막 목장이면 현황으로. 다시 돌아와 누르면 취소되고 그 자리에 머문다.
 *
 * 스탬프가 '다음' 을 겸하므로 읽지 않고 연타할 수 있다. 막지 않는다 — 마찰을 넣으면 이 단계를
 * 만든 이유가 사라진다. 대신 관찰한다: 상세를 열 때 last_read_at, 누를 때 stamped_at 이 찍히므로
 * 그 차이가 이 목장에 머문 시간이다(03 §2.2c). 시범 운영 후 이 값이 낮으면 스탬프와 다음을 다시 분리한다.
 *
 * 문구는 labels.ts 에서 온다 — 여기엔 코드만 있다.
 * 구구 테마: 찍기 전엔 잎빛 통통한 단추, 찍은 뒤엔 흰 단추에 잎빛 ✓.
 */
export function StampBar({
  reportId,
  initial,
  nextHref,
}: {
  reportId: string;
  initial: Stamp | null;
  /** 찍은 뒤 갈 곳 — 다음 목장 상세, 마지막이면 현황 */
  nextHref: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<Stamp | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const stamp = REPORT_STAMPS[0];
  const on = current === stamp;

  const tap = () => {
    setError(null);
    const before = current;
    // 낙관적으로 먼저 바꾼다 — 한 탭의 반응은 즉시여야 한다. 실패하면 되돌린다.
    setCurrent(on ? null : stamp);
    start(async () => {
      const res = await setStamp(reportId, stamp);
      if (!res.ok) {
        setCurrent(before);
        setError(res.message);
        return;
      }
      setCurrent(res.stamp);
      // 찍었으면(취소가 아니면) 다음으로. 취소는 그 자리에 머문다 — 잘못 눌렀을 때 돌아온 것이므로.
      if (res.stamp !== null) router.replace(nextHref); // 다음 목장으로 갈아 끼운다 — 뒤로 하면 제출 현황(목장마다 쌓이지 않게)
    });
  };

  return (
    <div className="mt-2 pt-2">
      {error ? (
        <p role="alert" className="mb-2.5 text-center text-[13px] font-semibold text-[var(--gg-berry-ink)]">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        aria-pressed={on}
        disabled={pending}
        onClick={tap}
        className={on ? `${BTN("white")} w-full !text-[var(--gg-leaf-ink)]` : `${BTN("leaf")} w-full`}
      >
        {REPORT_STAMP_LABELS[stamp]}
        {on ? <Icon d={ICON.check} className="h-5 w-5" strokeWidth={3} /> : null}
      </button>
    </div>
  );
}

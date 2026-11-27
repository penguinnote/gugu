import type { Metadata } from "next";
import Link from "next/link";

import { TabTitle } from "@/components/tab-title";
import { GuguSays } from "@/components/ui";

export const metadata: Metadata = {
  title: "로그인 도움말 · 구구",
};

/**
 * C-1a 로그인 실패·도움말.
 *
 * 초대 방식을 폐기하면서 "등록되지 않은 계정" 이라는 거부 자체가 사라졌다.
 * 누구나 로그인할 수 있고, 누구인지는 신청 → 승인으로 확인한다. 이 화면에
 * 오는 경우는 OAuth 왕복이 끊긴 것과 도움말뿐이다.
 *
 * 다만 한 가지 상황은 여전히 안내가 필요하다 — 예전에 구글로 승인받은 사람이
 * 카카오로 들어오면 별개의 계정이 되어 pending 부터 다시 시작한다. 신청
 * 목록에 자기 이름이 없으면(이미 연결됨) 그 신호다. 운영자가 풀어준다.
 */
export default async function LoginDeniedPage({ searchParams }: PageProps<"/login/denied">) {
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : "help";
  const copy = describe(reason);

  return (
    <>
      {/* 맨 위는 월드 그림 — 시계 자리까지 이어진다(2026-10-23) */}
      <TabTitle title="구구" photo="/home/hd-home.webp" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-7 px-6 pt-4 pb-16">
        <GuguSays mood={reason === "help" ? "wave" : "base"} size={88} lines={copy.say} />
        <div className="space-y-2">
          <h1 className="gg-display text-[28px] leading-tight">{copy.title}</h1>
          <p className="text-sm leading-relaxed text-muted">{copy.body}</p>
        </div>

        {reason === "locked" ? null : (
        <section className="gg-card space-y-3 px-5 py-4">
          <h2 className="gg-display text-[17px]">신청 목록에 내 이름이 없나요?</h2>
          <p className="text-sm leading-relaxed text-muted">
            카카오와 구글은 서로 다른 계정으로 취급됩니다. 이전에 다른 방법으로 승인받았다면
            이름이 이미 연결되어 목록에 나오지 않습니다.
          </p>
          <p className="text-sm leading-relaxed text-muted">
            어느 방법으로 가입했는지 기억나지 않으면{" "}
            <strong className="font-bold text-foreground">운영자에게 문의</strong>해 주세요.
            확인하고 바꿔줄 수 있습니다.
          </p>
        </section>
        )}

        <Link href="/login" className="gg-btn gg-btn-sky w-full">
          로그인으로
        </Link>
      </main>
    </>
  );
}

function describe(reason: string) {
  switch (reason) {
    case "no_code":
    case "exchange_failed":
      return {
        title: "로그인이 완료되지 않았습니다",
        say: ["로그인이 끊겼어요.", "다시 해 볼까요?"],
        body: "로그인 과정이 중간에 끊겼습니다. 다시 시도해 주세요.",
      };
    case "no_account":
      return {
        title: "계정을 만들지 못했습니다",
        say: ["계정을 못 만들었어요.", "다시 해 볼까요?"],
        body: "지원하지 않는 로그인 방식이거나 일시적인 오류입니다. 다시 시도해 주세요.",
      };
    case "locked":
      return {
        title: "잠긴 계정입니다",
        say: ["이 계정은 잠겨 있어요."],
        body: "운영자가 이 계정을 잠갔습니다. 운영자에게 문의해 주세요.",
      };
    default:
      return {
        title: "로그인 도움말",
        say: ["도와드릴게요!"],
        body: "구글 또는 카카오로 로그인한 뒤, 소속 목장에서 본인 이름을 골라 신청하면 운영자가 승인합니다.",
      };
  }
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { CARD } from "@/components/ui";
import { TERMS_VERSION } from "@/lib/terms";

export const metadata: Metadata = {
  title: "개인정보 처리방침 · 구구",
};

/**
 * 개인정보 처리방침(2026-11-13) — 로그인 없이 열린다(proxy PUBLIC_PATHS). 첫 접속 동의(/terms)와 내 정보에서 온다.
 * 사실은 문서와 맞춘다: 열람 범위 04 §4.1 · 보관 04 §7 · AI 보관 조건 06 §4.12 · 도입 공지 07 §0.
 * 고치면 lib/terms.ts 의 TERMS_VERSION 을 올려 모두에게 다시 묻는다.
 */
export default function PrivacyPage() {
  return (
    <>
      <AppHeader back="/terms" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 px-5 pt-1 pb-12">
        <header className="space-y-1">
          <h1 className="gg-display text-[26px] leading-tight">개인정보 처리방침</h1>
          <p className="text-[13px] text-[var(--gg-hint)] tabular-nums">시행 {TERMS_VERSION.replaceAll("-", ". ")}.</p>
        </header>

        <Part title="누가 처리하나요">
          <P>로뎀 청년부가 목장보고서 앱 &lsquo;구구&rsquo;로 처리합니다. 앱은 목장 리더 · 담당 목사님 · 임원진 · 운영자가 씁니다. 청년은 앱에 가입하지 않고, 목장 리더가 모임 뒤 기록합니다.</P>
          <P>개인정보 보호책임자는 로뎀 청년부 담당 목사님입니다. 궁금한 점이나 요청은 목장 리더나 담당 목사님께 말씀해 주세요.</P>
        </Part>

        <Part title="무엇을 처리하나요">
          <Items
            rows={[
              ["청년(기록되는 사람)", "이름 · 성별 · 소속 목장 · 출생년도 · 직업 · 소속 등 명단 정보(연락처 · 생년월일은 기록하지 않습니다), 예배 · 목장 출석과 사유, 기도제목(종교에 관한 민감정보), 리더가 적은 특이사항, 목장 프로필 사진(올린 경우)"],
              ["앱을 쓰는 사람", "로그인 계정의 이름 · 이메일(구글 · 카카오가 보내 주는 것), 알림을 받을 기기 정보, 앱에서 한 일(목장보고서 작성 · 열람, 내보내기, 구구 챗봇 질문 수), 첫 접속 동의 기록"],
            ]}
          />
        </Part>

        <Part title="왜 처리하나요">
          <P>목장 돌봄을 위해서입니다 — 출석과 기도제목을 기록하고, 오래 보이지 않는 지체를 살피고, 청년부 현황을 파악합니다. 앱을 쓰는 사람의 정보는 로그인과 알림, 권한 확인에만 씁니다.</P>
        </Part>

        <Part title="누가 볼 수 있나요">
          <Items
            rows={[
              ["기도제목 · 빠진 사유 · 특이사항 · 목장 모임 참석", "그 목장의 리더와 담당 목사님만. 다른 목장 리더 · 임원진 · 운영자는 볼 수 없습니다"],
              ["예배 출석 여부(현장 · 온라인)", "앱을 쓰는 사람 모두(출석부 — 사유는 보이지 않습니다)"],
              ["이름 · 소속 목장", "앱을 쓰는 사람 모두"],
              ["캠퍼스 모임 명단(이름 · 목장 · 캠퍼스)", "앱을 쓰는 사람 모두"],
              ["출생년도 · 직업 · 소속 등 명단 정보", "그 목장의 리더, 담당 목사님, 명단을 관리하는 임원진과 운영자"],
              ["AI 주간 정리", "담당 목사님만"],
            ]}
          />
          {/* 목장 이동(2026-11-26) — 동의서 · 도입 공지와 같은 문장. 볼 수 있는 범위를 좁히는 설명이라 TERMS_VERSION 은 올리지 않았다 */}
          <P>목장을 옮겨도 그 전 기록은 그 전 목장에 남습니다. 새 목장의 리더는 옮기기 전에 적힌 기도제목 · 특이사항 · 빠진 사유를 볼 수 없습니다.</P>
          <P>목장별로 볼 수 있는 범위는 데이터베이스 권한으로 막혀 있습니다. 다른 곳에 제공(제3자 제공)하지 않습니다.</P>
        </Part>

        <Part title="얼마나 보관하나요">
          <P>출석 · 기도제목 기록과 AI 정리는 2년이 지나면 정리합니다. 앱을 쓰는 사람의 계정 정보는 계정을 쓰는 동안 보관하고, 요청하면 지웁니다.</P>
          <P>데이터가 망가질 때를 대비해 매일 밤 전체를 암호화해 백업합니다. 매일 백업은 30일, 매달 1일 백업은 1년 보관한 뒤 지웁니다. 그래서 지운 기록도 암호화된 백업 안에는 최대 1년 남았다가 사라집니다. 백업을 여는 열쇠는 담당자 한 명만 따로 보관합니다.</P>
        </Part>

        <Part title="맡기는 곳과 해외로 가는 정보">
          <Items
            rows={[
              ["Supabase", "데이터베이스 · 로그인 — 서울 서버"],
              ["Vercel", "앱 서버 — 서울 서버"],
              ["GitHub", "암호화된 백업 보관 — 미국 서버. 열쇠 없이는 열 수 없습니다"],
              ["Anthropic (Claude)", "AI 요약 · 목장보고서 받아쓰기 — 미국 서버. 따로 동의한 청년의 기록만 보냅니다. 이름은 기호로 바꿔 보내지만 기도제목 글은 해외 서버를 거칩니다. 구구 챗봇은 묻는 말만 보냅니다(이름은 기호로) — 기록은 보내지 않고 앱이 직접 찾아 보여 줍니다. AI 학습에 쓰지 않고 30일 안에 지우며, 안전 검사에 걸린 글은 최대 2년 보관될 수 있습니다"],
              ["애플 · 구글 알림 서버", "알림 문구 전달 — 알림 문구에는 기도제목을 넣지 않습니다"],
            ]}
          />
          <P>로그인은 구글 · 카카오 계정으로 합니다.</P>
        </Part>

        <Part title="요청할 수 있는 것">
          <P>내 정보를 보거나 고치거나 지워 달라고, 처리를 멈춰 달라고 요청할 수 있습니다. 기록되기를 원하지 않는 청년은 목장 리더나 담당 목사님께 말씀해 주세요 — 기록에서 뺍니다. AI 기능에는 따로 동의한 청년의 기록만 보내고, 동의는 언제든 거둘 수 있습니다.</P>
        </Part>

        <Part title="어떻게 지키나요">
          <P>목장별 접근 제한(데이터베이스 권한), 모든 통신 암호화(HTTPS), 내보내기 기록 남기기, AI로 보낼 때 이름을 기호로 바꾸기. 앱을 쓰는 사람은 처음 들어올 때 비밀 유지를 약속합니다.</P>
        </Part>

        <Part title="바뀌면">
          <P>이 방침이 바뀌면 앱을 쓰는 사람에게 다음 접속 때 다시 동의를 받습니다.</P>
        </Part>
      </main>
    </>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${CARD} space-y-2.5 p-4`}>
      <h2 className="text-[16px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-[14px] leading-relaxed text-muted break-keep">{children}</p>;
}

function Items({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-2.5">
      {rows.map(([k, v]) => (
        <div key={k} className="space-y-0.5">
          <dt className="text-[14px] font-semibold">{k}</dt>
          <dd className="text-[14px] leading-relaxed text-muted break-keep">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

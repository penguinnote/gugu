import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { requireRole } from "@/lib/auth/session";

import { loadPersonAdmin, PersonAdminBody } from "./person-body";

export const metadata: Metadata = {
  title: "명단 · 구구",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A-1 사람 상세 — 운영자 전용. 이동 · 역할 · 목장장 · 상태 · 판정 태그 · 확인 필요 · 계정 연결.
 * 출석·기도제목은 여기 없다 — 운영자는 본문을 못 본다(04 §4).
 * 구구 테마: 머리에 이름 첫 글자 동그라미, 등록 직후 알림은 잎 빛 한 줄.
 */
export default async function PersonAdminPage({ params, searchParams }: PageProps<"/admin/people/[id]">) {
  await requireRole("admin");
  const { id } = await params;
  // 등록 직후(Step 11)면 한 줄 알림 — 새로고침해도 남지만 해가 없다
  const created = (await searchParams).created === "1";
  if (!UUID.test(id)) notFound();

  const data = await loadPersonAdmin(id);
  if (!data) notFound();

  return (
    <>
      <AppHeader back="/admin/people" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <PersonAdminBody data={data} created={created} />
      </main>
    </>
  );
}

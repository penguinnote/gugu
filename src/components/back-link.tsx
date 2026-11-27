"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { backIfCameFrom } from "@/lib/nav-history";

/**
 * 화면 위 '‹ 돌아가기' — 그 화면에서 들어왔으면 뒤로(아이폰 밀기 · 안드로이드 뒤로와 같은 곳), 아니면(알림 · 링크로 바로 열었을 때)
 * 그 주소로 갈아 끼운다. 기록이 쌓이지 않는다.
 */
export function BackLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      replace
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (backIfCameFrom(href)) e.preventDefault();
      }}
    >
      {children}
    </Link>
  );
}

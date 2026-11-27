"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { installNav, settle } from "@/lib/nav-history";

/** 뒤로가기 구조(lib/nav-history.ts)를 앱에 건다 — 처음 한 번 history 를 감싸고, 화면이 바뀔 때마다 층을 맞춘다 */
export function NavKeeper() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    installNav(router);
  }, [router]);
  useEffect(() => {
    settle();
  }, [pathname]);
  return null;
}

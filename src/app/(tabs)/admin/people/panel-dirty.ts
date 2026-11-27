"use client";

import { createContext } from "react";

/**
 * 넓은 화면 명단의 오른쪽 편집 칸(2026-11-27) — 칸 안의 폼이 '고친 채 저장 안 함' 을 알린다. 다른 사람을 누르면 버릴지 묻는 데 쓴다.
 * 휴대폰 상세 화면에는 이 칸이 없어(null) 아무 일도 없다.
 */
export const PanelDirty = createContext<((dirty: boolean) => void) | null>(null);

"use client";

import { useState, type ReactNode } from "react";

import { BTN } from "@/components/ui";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PDF_TYPE = "application/pdf";

function canShareFiles(type: string): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "a", { type })] });
  } catch {
    return false;
  }
}

/** 누른 손길이 아직 살아 있나 — 모르는 브라우저는 살아 있다고 보고 공유를 시도한다(실패하면 단추로) */
function stillActive(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return ua ? ua.isActive : true;
}

/** content-disposition 의 filename*=UTF-8''… 에서 파일 이름 */
function fileNameOf(res: Response, fallback: string): string {
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  return m ? decodeURIComponent(m[1]) : fallback;
}

type Got = { href: string; state: "loading" } | { href: string; state: "ready"; file: File } | { href: string; state: "error"; message: string };

/**
 * 파일 받기 단추(Excel · PDF) — 휴대폰(파일 공유가 되는 기기)에서는 이동하지 않고 받아서 **곧바로** 공유 시트(파일에 저장 · 보내기)를 연다(2026-10-29).
 * 아이폰 홈 화면 앱은 파일 주소로 바로 가면 미리보기가 앱을 덮고 닫을 단추가 없다(2026-10-14 내보내기, 2026-10-28 명단 엑셀).
 * 공유 시트는 누른 손길이 살아 있을 때만 열린다 — 파일 만드는 데 오래 걸려 손길이 식으면 '파일 저장 · 보내기' 단추를 한 번 더 보인다.
 * 컴퓨터는 그대로 내려받는다. href 가 null 이면 잠긴다.
 */
export function DownloadLink({
  href,
  className,
  children,
  type = XLSX_TYPE,
  loadingLabel = "파일 만드는 중…",
  testId,
}: {
  href: string | null;
  className: string;
  children: ReactNode;
  type?: string;
  loadingLabel?: string;
  testId?: string;
}) {
  const [got, setGot] = useState<Got | null>(null);
  const mine = got && got.href === href ? got : null;

  /** 공유 시트 — 열렸거나 닫혔으면 true, 손길이 식어 못 열었으면 false */
  async function share(file: File): Promise<boolean> {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (e) {
      return !(e instanceof DOMException && e.name === "NotAllowedError");
    }
  }

  async function fetchAndShare(h: string) {
    setGot({ href: h, state: "loading" });
    try {
      const res = await fetch(h, { cache: "no-store" });
      if (!res.ok) return setGot({ href: h, state: "error", message: (await res.text()) || "받지 못했어요." });
      const file = new File([await res.blob()], fileNameOf(res, type === PDF_TYPE ? "gugu.pdf" : "gugu.xlsx"), { type });
      if (stillActive() && (await share(file))) return setGot(null);
      setGot({ href: h, state: "ready", file });
    } catch {
      setGot({ href: h, state: "error", message: "받지 못했어요. 잠시 뒤 다시 눌러 주세요." });
    }
  }

  return (
    <>
      <a
        href={href ?? undefined}
        aria-disabled={!href}
        onClick={(e) => {
          if (!href) return e.preventDefault();
          if (canShareFiles(type)) {
            e.preventDefault();
            if (mine?.state !== "loading") void fetchAndShare(href);
          }
        }}
        className={className}
        data-testid={testId}
      >
        {mine?.state === "loading" ? loadingLabel : children}
      </a>
      {mine?.state === "ready" ? (
        <button
          type="button"
          onClick={() => void share(mine.file).then((ok) => ok && setGot(null))}
          className={`${BTN("sky")} w-full`}
          data-testid={testId ? `${testId}-share` : undefined}
        >
          파일 저장 · 보내기
        </button>
      ) : null}
      {mine?.state === "error" ? (
        <p className="text-center text-[13px] font-semibold text-[var(--gg-berry-ink)]" role="alert">
          {mine.message}
        </p>
      ) : null}
    </>
  );
}

import { INSTALL_HEAD_SCRIPT } from "@/lib/install-env";

import { InlineScript } from "./inline-script";
import { InstallGuide } from "./install-guide";

/**
 * 설치 안내 자리(2026-11-11) — 모든 화면에 숨겨 두고, 머리 스크립트가 휴대폰 브라우저라고 판정하면(<html data-install>)
 * globals.css 가 앱을 가리고 이것만 보인다. 그리기 전에 판정하므로 앱 화면이 번쩍 보였다 사라지지 않는다.
 */
export function InstallGate() {
  return (
    <div id="gg-install" className="fixed inset-0 z-[200] overflow-y-auto bg-[var(--background)]">
      <InstallGuide />
    </div>
  );
}

/**
 * 판정 스크립트 — 서버 HTML 머리에 그대로 들어가 그리기 전에 돈다. next/script 의 beforeInteractive 는
 * 앱 런타임이 뜬 뒤에 돌아서(self.__next_s) 앱 화면이 잠깐 보인다.
 */
export function InstallHeadScript() {
  return <InlineScript html={INSTALL_HEAD_SCRIPT} />;
}

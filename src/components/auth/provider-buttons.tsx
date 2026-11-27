import { AUTH_PROVIDERS, PROVIDER_LABELS, enabledProviders } from "@/lib/auth/providers";

/**
 * 카카오 / 구글 로그인 버튼 — 구구 테마의 통통한 단추(카카오는 노란 단추).
 *
 * 폼 POST 라 자바스크립트 없이도 동작한다. 주 1회 쓰는 앱이고 대부분 모바일
 * 브라우저에서 처음 열기 때문에, 하이드레이션을 기다렸다가 눌리는 버튼보다
 * 바로 눌리는 버튼이 낫다.
 *
 * 아직 켜지 않은 제공자는 숨기지 않고 비활성으로 남긴다. 카카오를 기대하고
 * 들어온 사람이 버튼이 아예 없으면 "잘못 들어왔나" 로 읽지만, '준비 중' 이라고
 * 적혀 있으면 구글을 누르면 된다는 것을 안다.
 */
export function ProviderButtons({ next }: { next?: string }) {
  const enabled = enabledProviders();

  return (
    <div className="flex w-full flex-col gap-3">
      {AUTH_PROVIDERS.map((provider) => {
        const on = enabled.includes(provider);
        const label = PROVIDER_LABELS[provider];
        return (
          <form key={provider} action="/auth/start" method="post" className="w-full">
            <input type="hidden" name="provider" value={provider} />
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <button
              type="submit"
              disabled={!on}
              aria-disabled={!on}
              className={[
                "gg-btn w-full disabled:cursor-not-allowed",
                provider === "kakao" ? "gg-btn-kakao" : "gg-btn-white",
              ].join(" ")}
            >
              {label}로 {on ? "시작하기" : "시작하기 (준비 중)"}
            </button>
          </form>
        );
      })}
    </div>
  );
}

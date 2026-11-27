import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { TabTitle } from "@/components/tab-title";
import { GuguSays } from "@/components/ui";
import { PROVIDER_LABELS } from "@/lib/auth/providers";
import { GROUP_ROLE_LABELS, USER_ROLE_LABELS, groupLabel } from "@/lib/labels";
import { requireUser } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Fn = Database["public"]["Functions"];
type ApplicationGroup = Fn["list_application_groups"]["Returns"][number];
type ClaimablePerson = Fn["list_claimable_persons"]["Returns"][number];

import { cancelApplication, reportNameTaken, submitApplication, submitRoleRequest } from "./actions";

/**
 * 시작 화면의 두 갈래 — 고른 뒤에야 이름 고르기(리더)나 신청 단추(목사님)가 나온다.
 * 임원진은 여기서 신청하지 않는다(2026-11-16) — 리더로 들어온 뒤 운영자가 '계정 권한' 에서 맡긴다.
 */
type Mode = "pastor" | "leader";
const MODES: Array<{ mode: Mode; label: string }> = [
  { mode: "pastor", label: "목사님" },
  { mode: "leader", label: "리더" },
];
const isMode = (v: unknown): v is Mode => v === "pastor" || v === "leader";

export const metadata: Metadata = {
  title: "신청 · 구구",
};

/**
 * 신청 화면 — pending 사용자가 "나는 누구인가" 를 고르는 곳.
 *
 * 맨 처음은 두 갈래다 — 목사님 · 리더. 고르면 운영자에게 승인 요청이 간다(/approvals).
 *   목사님   이름을 고르지 않는다 — 단추 하나로 신청
 *   임원진   신청하지 않는다(2026-11-16) — 리더로 승인받은 뒤 운영자가 '계정 권한' 에서 맡긴다
 *   리더     아래(목장 → 이름) 그대로
 *
 * 자유 입력이 아니라 **목록 선택**이다. 오타와 동명이인을 막고, 이미 연결된
 * 사람은 목록에서 빠지므로 중복 연결이 구조적으로 불가능하다. 목록에 자기
 * 이름이 없다면 둘 중 하나다 — 명단에 아직 없거나, 다른 계정으로 이미
 * 승인받았거나. 둘 다 운영자가 푼다.
 *
 * 상태는 세 가지다.
 *   신청 전     목장 고르기 → 이름 고르기. 이미 다른 계정이 잡은 이름은 **지우지 않고**
 *               고를 수 없게 보인다 — 지우면 본인이 자기 이름을 못 찾는다. 누르면
 *               "처음 사용하신 구글로 로그인해 주세요" 와 다시 로그인하는 버튼
 *   승인 대기   누구로 신청했는지 보여주고 기다린다 — 확인은 운영자가 한다
 *   거절됨      사유 안내 후 다시 고를 수 있다
 */
export default async function ApplyPage({ searchParams }: PageProps<"/apply">) {
  const me = await requireUser();
  if (me.role !== "pending") redirect("/me");

  if (me.applicationStatus === "pending") {
    const role = me.pendingRole ?? "leader";
    return (
      <Shell title="승인을 기다리고 있습니다">
        <GuguSays mood="smile" lines={["신청을 받았어요!", "조금만 기다려요."]} />
        <p className="text-sm leading-relaxed text-muted" data-testid="pending-what">
          <strong className="font-extrabold text-[var(--gg-sky-ink)]">
            {role === "leader"
              ? `${groupLabel(me.pendingGroupName)} ${me.pendingPersonName}`
              : me.pendingPersonName
                ? `${USER_ROLE_LABELS[role]} · ${groupLabel(me.pendingGroupName)} ${me.pendingPersonName}`
                : USER_ROLE_LABELS[role]}
          </strong>
          {role === "leader" ? "(으)로 신청했습니다." : "으로 신청했습니다."}
        </p>
        <form action={cancelApplication}>
          <button type="submit" className={secondaryButton} data-testid="cancel-application">
            신청 취소하고 다시 고르기
          </button>
        </form>
        <form action="/auth/signout" method="post">
          <button type="submit" className={secondaryButton}>
            로그아웃
          </button>
        </form>
      </Shell>
    );
  }

  const params = await searchParams;
  const mode: Mode | null = isMode(params.mode) ? params.mode : null;
  const groupParam = typeof params.group === "string" ? params.group : "";
  const error = typeof params.error === "string" ? params.error : undefined;
  const claimedParam = typeof params.claimed === "string" ? params.claimed : undefined;

  const rejectedNote =
    me.applicationStatus === "rejected" ? (
      <p className="rounded-2xl bg-[var(--gg-sun-soft)] px-4 py-3 text-sm leading-relaxed font-semibold text-[var(--gg-sun-ink)]">
        이전 신청이 승인되지 않았습니다. 다시 골라 주세요.
      </p>
    ) : null;

  if (!mode) {
    return (
      <Shell title="어떤 분이신가요?">
        {rejectedNote ?? <GuguSays mood="wave" size={76} lines={["반가워요!", "어떤 분인지 골라 주세요."]} />}
        <nav aria-label="역할" className="flex flex-col gap-3" data-testid="role-pick">
          {MODES.map((m) => (
            <Link key={m.mode} href={`/apply?mode=${m.mode}`} className="gg-btn gg-btn-white w-full !h-16 !text-[19px]">
              {m.label}
            </Link>
          ))}
        </nav>
        <SignOut />
      </Shell>
    );
  }

  if (mode === "pastor") {
    return (
      <Shell title="목사님으로 신청">
        {error === "apply" ? (
          <p role="alert" className={ALERT}>
            신청하지 못했습니다. 이미 신청 중일 수 있습니다.
          </p>
        ) : (
          <GuguSays mood="wave" size={76} lines={["목사님, 반가워요!", "운영자에게 알려 드릴게요."]} />
        )}
        <form action={submitRoleRequest}>
          <input type="hidden" name="role" value="pastor" />
          <button type="submit" className={primaryButton}>
            목사님으로 승인 요청
          </button>
        </form>
        <BackToPick />
      </Shell>
    );
  }

  const supabase = await createClient();
  const { data: groupData } = await supabase.rpc("list_application_groups");
  const groups: ApplicationGroup[] = groupData ?? [];
  const selected = groups.find((g) => String(g.number) === groupParam) ?? null;

  let people: ClaimablePerson[] | null = null;
  if (selected) {
    const { data } = await supabase.rpc("list_claimable_persons", { p_group_id: selected.id });
    people = data ?? [];
  }
  // 점유된 이름을 누른(또는 우회해서 신청한) 경우. 그 사람이 정말 점유돼 있을 때만 안내한다.
  const claimedPerson = people?.find((p) => p.id === claimedParam && p.claimed) ?? null;
  const claimedProviderLabel = claimedPerson?.claimed_provider
    ? PROVIDER_LABELS[claimedPerson.claimed_provider]
    : null;

  return (
    <Shell title="본인 이름을 골라 주세요">
      <GuguSays mood="wave" size={76} lines={["반가워요!", "내 이름을 찾아 줘요."]} />

      {error === "apply" && !claimedPerson ? (
        <p role="alert" className={ALERT}>
          신청하지 못했습니다. 이미 신청 중이거나 고른 이름이 방금 다른 계정에 연결됐을
          수 있습니다. 목록을 다시 확인해 주세요.
        </p>
      ) : null}
      {error === "pick" ? (
        <p role="alert" className={ALERT}>
          이름을 하나 골라 주세요.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="gg-display text-[18px]">1. 소속 목장</h2>
        <div className="grid grid-cols-3 gap-2">
          {groups.map((g) => {
            const active = selected?.id === g.id;
            return (
              <Link
                key={g.id}
                href={`/apply?mode=${mode}&group=${g.number}`}
                aria-current={active ? "true" : undefined}
                className={`gg-btn gg-btn-sm !h-12 !px-1 !text-[16px] ${active ? "gg-btn-sky" : "gg-btn-white"}`}
              >
                {g.name}
              </Link>
            );
          })}
        </div>
      </section>

      {claimedPerson ? (
        // 로그아웃은 수단이고 목적은 맞는 계정으로 다시 들어오는 것이다 — 버튼이 그렇게 말한다.
        <div role="alert" className="space-y-3 rounded-[20px] bg-[var(--gg-sun-soft)] px-4 py-3.5 text-sm leading-relaxed">
          <p className="font-semibold">
            <strong className="font-extrabold">{claimedPerson.name}</strong> 이름은 이미 다른 로그인 방법으로
            신청되어 있습니다.{" "}
            {claimedProviderLabel
              ? `처음 사용하신 ${claimedProviderLabel}로 로그인해 주세요.`
              : "처음 사용하신 방법으로 로그인해 주세요."}
          </p>
          <form action="/auth/signout" method="post">
            <button type="submit" className={primaryButton}>
              {claimedProviderLabel ? `${claimedProviderLabel}로 다시 로그인하기` : "다른 방법으로 다시 로그인하기"}
            </button>
          </form>
          {/* 다른 사람이 내 이름으로 들어간 경우(2026-11-06) — 운영자에게 알린다. 운영자가 연결을 풀어 준다 */}
          {params.reported ? (
            <p className="font-semibold" data-testid="name-reported">운영자에게 알렸어요. 확인해서 연락드릴게요.</p>
          ) : (
            <form action={reportNameTaken}>
              <input type="hidden" name="person_id" value={claimedPerson.id} />
              <input type="hidden" name="group" value={groupParam} />
              <input type="hidden" name="mode" value={mode ?? ""} />
              <button type="submit" className={secondaryButton} data-testid="report-name">
                제 이름이 아니에요(다른 사람이 들어갔어요)
              </button>
            </form>
          )}
        </div>
      ) : null}

      {selected ? (
        <form action={submitApplication} className="space-y-3">
          <input type="hidden" name="group" value={selected.number} />
          <input type="hidden" name="mode" value={mode} />
          <h2 className="gg-display text-[18px]">2. {groupLabel(selected.name)}에서 내 이름</h2>

          {people && people.length > 0 ? (
            <ul className="gg-card divide-y divide-[var(--gg-line)] overflow-hidden">
              {people.map((p) =>
                p.claimed ? (
                  // 점유된 이름 — 지우지 않는다. 고를 수는 없고, 누르면 어디로 돌아갈지 알려준다.
                  <li key={p.id}>
                    <Link
                      href={`/apply?mode=${mode}&group=${selected.number}&claimed=${p.id}`}
                      aria-disabled="true"
                      className="flex items-center gap-3 px-4 py-3.5 text-muted"
                    >
                      <span aria-hidden className="size-5 rounded-full border-2 border-[var(--gg-line)]" />
                      <span className="flex-1 text-[15px] font-bold line-through decoration-[var(--gg-stone)]">
                        {p.name}
                      </span>
                      <span className="text-xs">
                        이미 연결됨{p.claimed_provider ? ` · ${PROVIDER_LABELS[p.claimed_provider]}` : ""}
                      </span>
                    </Link>
                  </li>
                ) : (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3.5 has-[:checked]:bg-[var(--gg-sky-soft)]">
                      <input type="radio" name="person_id" value={p.id} required className="size-5 accent-[var(--gg-sky)]" />
                      <span className="flex-1 text-[15px] font-bold">{p.name}</span>
                      <span className="text-xs text-muted">
                        {GROUP_ROLE_LABELS[p.group_role]} ·{" "}
                        {p.birth_year ? `${p.birth_year}년생` : "출생년도 없음"}
                      </span>
                    </label>
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p className="rounded-2xl bg-[var(--gg-field)] px-4 py-3 text-sm leading-relaxed text-muted">
              이 목장에 등록된 리더가 없습니다. 명단에 아직 없다면 운영자에게 말씀해 주세요.{" "}
              <Link href="/login/denied?reason=help" className="underline underline-offset-4">
                도움말
              </Link>
            </p>
          )}

          {people && people.some((p) => !p.claimed) ? (
            <button type="submit" className={primaryButton}>
              이 이름으로 신청
            </button>
          ) : null}
        </form>
      ) : null}

      <BackToPick />
    </Shell>
  );
}

/** 처음 세 갈래로 — 그 아래 로그아웃 */
function BackToPick() {
  return (
    <div className="flex flex-col items-center gap-1">
      <Link href="/apply" className="py-2 text-center text-sm font-bold text-[var(--gg-sky-ink)]">
        다시 고르기
      </Link>
      <SignOut />
    </div>
  );
}

function SignOut() {
  return (
    <form action="/auth/signout" method="post" className="w-full">
      <button type="submit" className="w-full py-2 text-center text-xs text-muted underline underline-offset-4">
        로그아웃
      </button>
    </form>
  );
}

const primaryButton = "gg-btn gg-btn-sky w-full";
const secondaryButton = "gg-btn gg-btn-white w-full";
const ALERT = "rounded-2xl bg-[var(--gg-berry-soft)] px-4 py-3 text-sm leading-relaxed font-semibold text-[var(--gg-berry-ink)]";

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      {/* 맨 위는 월드 그림 — 시계 자리까지 이어진다(2026-10-23) */}
      <TabTitle title={title} sub="구구" photo="/home/hd-home.webp" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-7 px-5 pt-1 pb-12">{children}</main>
    </>
  );
}

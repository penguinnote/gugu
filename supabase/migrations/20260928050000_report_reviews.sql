-- ===========================================================================
-- Step 5 — 목사님의 읽음 표시와 스탬프 (2026-09-28)
--
-- 측정된 기준선: 제출률 30%, 목사님 피드백 0%. 피드백 0% 는 무심해서가 아니라 구조가
-- 없어서 생겼다. 그래서 이 단계의 성공 기준은 "잘 보이는가" 가 아니라 **"본 흔적이 리더에게
-- 닿는가"** 다. 매주 12개에 글을 쓰는 설계는 반드시 다시 0 이 된다 — 반응은 비용이 거의 0 이어야
-- 한다. 그래서 자유 코멘트가 아니라 **읽음(자동) + 스탬프(한 탭)** 다.
--
--   report_reviews   보고서(목장×주차) 하나에 행 하나 = 저장 단위.
--     first_read_at  첫 열람 시각. 고정 — 리더에게 "화요일에 확인하셨다" 로 보이는 시각이 나중에
--                    바뀌면 안 된다. last_read_at · read_count 만 갱신된다.
--     stamp          한 목장에 하나. 같은 것을 다시 누르면 취소(null), 다른 것을 누르면 바뀐다.
--                    코드(pray·thanks·cheer)만 저장하고 문구는 labels.ts 에 — 목사님 말투에 맞춰
--                    시범 운영 전에 바꾼다.
--
--   읽음의 정의      상세 화면의 서버 렌더 1회 = mark_report_read(). 목록 렌더·프리페치는 아니다.
--                    미제출 보고서는 열리지 않으므로 읽음이 생기지 않는다.
--
--   왜 reports 컬럼이 아니라 별도 테이블인가
--     reports 는 리더가 UPDATE 하는 행이다. 읽음·스탬프를 거기 두면 리더의 UPDATE 정책과 목사님의
--     UPDATE 정책이 같은 행에서 섞이고, 리더가 자기 보고서의 스탬프를 지우는 경로가 열린다.
--     별도 테이블이면 "목사님만 쓰고 그 목장 리더는 읽는다" 가 정책 한 줄로 끝난다.
--
--   경계
--     목사님        전부 읽고 쓴다 (쓰기는 RPC 두 개로만 — 테이블 직접 쓰기 권한 없음)
--     그 목장 리더  자기 목장 review 읽기만 — is_leader_of(reports.group_id)
--     다른 목장 리더 · 미승인 · 운영자   0행 (운영자는 본문을 못 보는 원칙 그대로)
-- ===========================================================================

create type public.report_stamp as enum ('pray', 'thanks', 'cheer');

comment on type public.report_stamp is
  '목사님 스탬프 코드. 문구는 src/lib/labels.ts REPORT_STAMP_LABELS (초안: 기도하겠습니다 / 수고했어요 / 힘내세요).';

create table public.report_reviews (
  report_id     uuid primary key references public.reports (id) on delete cascade,
  reviewer_id   uuid not null references public.users (id) on delete restrict,

  first_read_at timestamptz not null default now(),
  last_read_at  timestamptz not null default now(),
  read_count    integer     not null default 1 check (read_count >= 1),

  stamp         public.report_stamp,
  stamped_at    timestamptz,

  -- 스탬프를 찍거나 취소한 시각. 취소해도 시각은 남고 stamp 만 null 이다.
  constraint report_reviews_stamp_time_ck check (stamp is null or stamped_at is not null)
);

comment on table public.report_reviews is
  '목사님이 보고서 상세를 연 흔적과 스탬프. 보고서당 한 행. 첫 열람 시각은 고정. 목사님만 쓰고(RPC) 그 목장 리더는 읽는다.';

alter table public.report_reviews enable row level security;

grant select on public.report_reviews to authenticated;
revoke all on public.report_reviews from anon;
-- insert/update/delete 권한은 주지 않는다. 쓰기는 아래 정의자 함수로만.

create policy report_reviews_select on public.report_reviews for select to authenticated
  using (
    public.is_pastor()
    or exists (select 1 from public.reports r where r.id = report_id and public.is_leader_of(r.group_id))
  );

-- ---------------------------------------------------------------------------
-- mark_report_read — 상세 화면의 서버 렌더가 부른다. 목사님만.
-- ---------------------------------------------------------------------------

create function public.mark_report_read(p_report_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me uuid := public.current_user_id();
begin
  if not public.is_pastor() then
    raise exception '목사님만 읽음을 남길 수 있습니다.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reports r where r.id = p_report_id and r.submitted_at is not null) then
    raise exception '제출된 보고서가 아닙니다.' using errcode = '22023';
  end if;

  insert into public.report_reviews (report_id, reviewer_id)
  values (p_report_id, v_me)
  on conflict (report_id) do update
    set last_read_at = now(),
        read_count   = public.report_reviews.read_count + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_report_stamp — 한 탭. 같은 것을 다시 누르면 취소. 상세 안에서만 찍히므로 읽음도 보장한다.
-- ---------------------------------------------------------------------------

create function public.set_report_stamp(p_report_id uuid, p_stamp public.report_stamp)
returns public.report_stamp
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me  uuid := public.current_user_id();
  v_cur public.report_stamp;
  v_new public.report_stamp;
begin
  if not public.is_pastor() then
    raise exception '목사님만 스탬프를 찍을 수 있습니다.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reports r where r.id = p_report_id and r.submitted_at is not null) then
    raise exception '제출된 보고서가 아닙니다.' using errcode = '22023';
  end if;

  -- 읽음이 없으면 만든다 — 스탬프는 상세 안에서만 찍히므로 읽은 것이 맞다.
  insert into public.report_reviews (report_id, reviewer_id)
  values (p_report_id, v_me)
  on conflict (report_id) do nothing;

  select rr.stamp into v_cur from public.report_reviews rr where rr.report_id = p_report_id for update;
  v_new := case when v_cur is not distinct from p_stamp then null else p_stamp end;

  update public.report_reviews
     set stamp = v_new, stamped_at = now()
   where report_id = p_report_id;

  return v_new;
end;
$$;

revoke execute on function
  public.mark_report_read(uuid), public.set_report_stamp(uuid, public.report_stamp)
from public, anon, authenticated;

grant execute on function
  public.mark_report_read(uuid), public.set_report_stamp(uuid, public.report_stamp)
to authenticated;

create index report_reviews_stamp_idx on public.report_reviews (stamped_at) where stamp is not null;

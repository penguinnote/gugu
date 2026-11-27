-- ===========================================================================
-- 로뎀 월드 함께 걷기 1단계 — 실시간 채널 권한 (2026-10-14)
--
-- 월드에 있는 사람끼리 서로의 캐릭터를 실시간으로 본다. Supabase Realtime 의 사설 채널 하나('world:lobby')를 쓴다:
--   presence   누가 들어와 있나 + 생김새 · 목장 자리(들어올 때와 생김새가 바뀔 때만)
--   broadcast  자리 · 방향 · 동작(움직이는 동안 1초에 네 번 남짓)
-- DB 에 아무것도 저장하지 않는다 — Realtime 은 이 표(realtime.messages)의 정책으로 들어올 수 있는지만 따진다.
--
-- 정책: 앱 사용자(리더 · 목사님 · 운영자)만, 이 주제(world:lobby)만, 받기(select) · 보내기(insert) 둘 다.
--   미승인 · 로그인 안 한 사람은 들어오지 못한다(사설 채널이라 공개 키만으로는 못 들어온다).
-- realtime 스키마가 없는 곳(로컬 시험 DB — PGlite)에서는 건너뛴다.
-- ===========================================================================

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages 가 없어 world:lobby 정책을 건너뜁니다(시험 DB).';
    return;
  end if;

  execute $p$
    create policy world_lobby_read on realtime.messages
      for select to authenticated
      using (
        (select realtime.topic()) = 'world:lobby'
        and realtime.messages.extension in ('broadcast', 'presence')
        and (select public.is_app_user())
      )
  $p$;

  execute $p$
    create policy world_lobby_write on realtime.messages
      for insert to authenticated
      with check (
        (select realtime.topic()) = 'world:lobby'
        and realtime.messages.extension in ('broadcast', 'presence')
        and (select public.is_app_user())
      )
  $p$;
end;
$$;

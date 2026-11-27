/** 로뎀 월드 열매 — 빨간 열매 두 알과 잎 하나. 홈·보고서 화면의 열매 숫자 옆에 */
export function BerryIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <path d="M10 3.2c1.6-1.6 4-1.7 5.6-.6-1.2 1.9-3.4 2.6-5.6.6z" fill="#5fae5a" />
      <path d="M10 3.4 7.6 9.2M10 3.4l2.6 6.2" stroke="#4a7d3f" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <circle cx="6.6" cy="12.4" r="4" fill="#e2504c" />
      <circle cx="13.4" cy="12.8" r="4" fill="#d43f48" />
      <circle cx="5.3" cy="11.1" r="1.1" fill="#fff" opacity="0.7" />
      <circle cx="12.1" cy="11.5" r="1.1" fill="#fff" opacity="0.7" />
    </svg>
  );
}

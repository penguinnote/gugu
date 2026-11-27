/** 고른 사진을 가운데에서 정사각으로 잘라 줄인다 — WebP 로, 안 되면(아이폰 사파리) JPEG(2026-11-11 프로필 사진) */
export async function squareDataUrl(file: File, size = 320): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const el = new Image();
      el.onload = () => ok(el);
      el.onerror = () => fail(new Error("사진을 열지 못했어요."));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const g = cv.getContext("2d");
    if (!g || !side) throw new Error("사진을 열지 못했어요.");
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    const webp = cv.toDataURL("image/webp", 0.85);
    return webp.startsWith("data:image/webp") ? webp : cv.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

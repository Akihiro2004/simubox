import type { Discovery } from "@/lib/builder/catalog";

/** Baked from AssetModel in /asset-studio; the shop never renders thumbnails at runtime. */
export function AssetThumb({ item }: { item: Discovery }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny pre-rendered local asset, already sized for its card
  return <img src={`/asset-thumbnails/${item.asset}.png`} alt="" width={192} height={144} loading="lazy" decoding="async" className="h-full w-full object-contain" draggable={false} />;
}

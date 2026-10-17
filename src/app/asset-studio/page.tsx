import { notFound } from "next/navigation";
import ThumbnailStudio from "@/components/builder/thumbnail-studio";

export default function AssetStudioPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ThumbnailStudio />;
}

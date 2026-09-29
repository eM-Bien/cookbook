import { dishEmoji, toneFor } from "@/lib/look";

export function RecipeThumb({
  title,
  imageUrl,
  tags,
  small = false,
}: {
  title: string;
  imageUrl: string | null;
  tags?: string[];
  small?: boolean;
}) {
  return (
    <span className={small ? "thumb thumb-sm" : "thumb"} data-tone={toneFor(title)} aria-hidden="true">
      {imageUrl ? (
        // Photos come from any recipe site, so they cannot go through next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        dishEmoji(tags)
      )}
    </span>
  );
}

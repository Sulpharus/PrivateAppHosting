import { iconUrl } from '../lib/appIcon.ts';
import { type AppRow, monogram, tintFor } from '../lib/apps.ts';

/** The logo of an app, or its coloured monogram when it has none. */
export function AppIcon({
  app,
  size,
  fontSize,
}: {
  app: Pick<AppRow, 'slug' | 'name' | 'icon_path'>;
  size?: number;
  fontSize?: number;
}) {
  const url = iconUrl(app.icon_path);
  const box = size ? { width: size, height: size } : undefined;
  if (url)
    return (
      <img
        className="app-icon"
        src={url}
        alt=""
        width={size ?? 44}
        height={size ?? 44}
        loading="lazy"
        decoding="async"
        style={box}
      />
    );
  return (
    <div
      className="monogram"
      style={{ background: tintFor(app.slug), ...box, ...(fontSize ? { fontSize } : {}) }}
      aria-hidden="true"
    >
      {monogram(app.name)}
    </div>
  );
}

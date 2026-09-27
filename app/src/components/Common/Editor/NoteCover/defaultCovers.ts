export type DefaultCover = {
  /** Stable id stored in metadata.cover as `cover:<key>` */
  key: string
  /** Data URI - keeps the gallery offline and free of extra requests */
  src: string
}

const toDataUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`

const PALETTES: Array<[c1: string, c2: string, c3: string]> = [
  ['#7454fc', '#3d2ea8', '#a78bfa'],
  ['#ff7a45', '#c2185b', '#ffb37b'],
  ['#0ea5e9', '#0f766e', '#7dd3fc'],
  ['#22c55e', '#0f766e', '#86efac'],
  ['#f59e0b', '#b45309', '#fcd34d'],
  ['#ef4444', '#7f1d1d', '#fca5a5'],
  ['#8b5cf6', '#312e81', '#c4b5fd'],
  ['#06b6d4', '#1e3a8a', '#67e8f9'],
  ['#ec4899', '#831843', '#f9a8d4'],
  ['#14b8a6', '#134e4a', '#99f6e4'],
  ['#6366f1', '#1e1b4b', '#a5b4fc'],
  ['#f97316', '#78350f', '#fdba74'],
]

const buildCover = (index: number, c1: string, c2: string, c3: string): string => {
  const cx = 0.2 + (index % 4) * 0.22
  const cy = 0.18 + ((index % 3) * 0.3)
  return toDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="b1" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="0.7">
      <stop offset="0" stop-color="${c3}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${c3}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="b2" cx="0.85" cy="0.9" r="0.6">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#g)"/>
  <rect width="1600" height="900" fill="url(#b1)"/>
  <rect width="1600" height="900" fill="url(#b2)"/>
</svg>
`)
}

export const DEFAULT_COVERS: DefaultCover[] = PALETTES.map(([c1, c2, c3], i) => ({
  key: `cover-${i + 1}`,
  src: buildCover(i, c1, c2, c3),
}))

const PREFIX = 'cover:'

/**
 * metadata.cover holds either a gallery key (`cover:cover-3`) or a real
 * uploaded path/URL. A gallery key that no longer resolves to a cover renders
 * nothing rather than a broken image.
 */
export const toCoverUrl = (cover?: string | null): string | undefined => {
  if (!cover) return undefined
  if (cover.startsWith(PREFIX)) {
    return DEFAULT_COVERS.find((c) => c.key === cover.slice(PREFIX.length))?.src
  }
  return cover
}

export const isDefaultCoverKey = (cover?: string | null): boolean =>
  !!cover && cover.startsWith(PREFIX)

export const randomDefaultCoverKey = (exclude?: string | null): string => {
  const pool = DEFAULT_COVERS.filter((c) => c.key !== exclude)
  const list = pool.length ? pool : DEFAULT_COVERS
  return list[Math.floor(Math.random() * list.length)]!.key
}

/** Gallery key -> nothing special; uploaded covers are opaque paths. */
export const randomCoverValue = (exclude?: string | null): string =>
  `${PREFIX}${randomDefaultCoverKey(exclude)}`

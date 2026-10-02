export type CoverCategory = 'official' | 'work' | 'scenery' | 'creative' | 'tech'

export type DefaultCover = {
  /** Stable id stored in metadata.cover as `cover:<key>` */
  key: string
  /** Data URI - keeps the gallery offline and free of extra requests */
  src: string
  category: CoverCategory
}

/** Feishu-style gallery tabs, in display order. */
export const COVER_CATEGORIES: Array<{ key: CoverCategory; labelKey: string }> = [
  { key: 'official', labelKey: 'cover-cat-official' },
  { key: 'work', labelKey: 'cover-cat-work' },
  { key: 'scenery', labelKey: 'cover-cat-scenery' },
  { key: 'creative', labelKey: 'cover-cat-creative' },
  { key: 'tech', labelKey: 'cover-cat-tech' },
]

const toDataUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`

/**
 * Feishu ships 2000x400 covers (5:1). Matching that ratio keeps the crop
 * preview and the note header honest about what the image actually is.
 */
const frame = (id: string, defs: string, body: string): string => toDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 400" width="2000" height="400">
  <defs>${defs}</defs>
  <rect width="2000" height="400" fill="url(#sky${id})"/>
  ${body}
</svg>
`)

const grad = (id: string, stops: Array<[offset: string, color: string]>): string =>
  `<linearGradient id="sky${id}" x1="0" y1="0" x2="0.35" y2="1">
    ${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}
  </linearGradient>`

/** Deterministic pseudo-random: the art must be identical between builds. */
const seeded = (seed: number) => {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

/* ------------------------------------------------------------------ */
/* Scenery — the original illustrated set                              */
/* ------------------------------------------------------------------ */

const SCENERY_ART: string[] = [
  // Sunrise ridge
  frame('1', grad('1', [['0', '#FFE2B0'], ['0.55', '#FFA26B'], ['1', '#7C4A6B']]), `
    <circle cx="1520" cy="248" r="66" fill="#FFF3D6" opacity="0.95"/>
    <path d="M0 400V286l360-96 260 74 300-88 340 122 380-96 360 108V400Z" fill="#5C4A6B" opacity="0.55"/>
    <path d="M0 400V330l420-74 380 86 420-70 400 96 380-58V400Z" fill="#2E2540" opacity="0.85"/>
    <path d="M0 400V368l480-46 520 62 480-40 520 54V400Z" fill="#1A1526"/>`),

  // Starry night
  (() => {
    const r = seeded(7)
    const stars = Array.from({ length: 60 }, () => {
      const x = (r() * 2000).toFixed(0)
      const y = (r() * 300).toFixed(0)
      return `<circle cx="${x}" cy="${y}" r="${(r() * 2 + 0.8).toFixed(1)}" fill="#FFFFFF" opacity="${(0.35 + r() * 0.55).toFixed(2)}"/>`
    }).join('')
    return frame('2', grad('2', [['0', '#0B1026'], ['0.6', '#1B2A5B'], ['1', '#3C4E86']]), `
      ${stars}
      <circle cx="1660" cy="96" r="52" fill="#FDF6D8"/>
      <circle cx="1634" cy="82" r="52" fill="#16234B"/>
      <path d="M0 400V318l420-58 380 44 420-52 400 60 380-34V400Z" fill="#0A0F1F"/>`)
  })(),

  // Ocean swell
  frame('3', grad('3', [['0', '#8EE6E0'], ['0.5', '#1D9E9E'], ['1', '#084B5A']]), `
    <path d="M0 250c260-70 520 70 780 10s520-90 780-30v170H0Z" fill="#0E7C8C" opacity="0.55"/>
    <path d="M0 300c300-60 560 60 860 6s560-70 1140-16v110H0Z" fill="#075C6E" opacity="0.75"/>
    <path d="M0 350c340-44 620 40 960 6s600-36 1040-10v54H0Z" fill="#04333F"/>
    <circle cx="300" cy="110" r="46" fill="#FFFFFF" opacity="0.28"/>`),

  // Misty forest
  frame('4', grad('4', [['0', '#DCEFE0'], ['0.55', '#8FC0A0'], ['1', '#2F5D46']]), `
    <g fill="#27523F" opacity="0.5">
      <path d="M120 400V170l70-120 70 120v230Z"/><path d="M320 400V140l80-110 80 110v260Z"/>
      <path d="M540 400V190l64-104 64 104v210Z"/><path d="M760 400V130l86-100 86 100v270Z"/>
      <path d="M1000 400V180l70-112 70 112v220Z"/><path d="M1220 400V150l80-108 80 108v250Z"/>
      <path d="M1460 400V190l66-104 66 104v210Z"/><path d="M1680 400V140l84-110 84 110v260Z"/>
    </g>
    <g fill="#1B3B2C">
      <path d="M0 400V250l90-96 90 96v150Z"/><path d="M240 400V230l100-90 100 90v170Z"/>
      <path d="M520 400V258l84-88 84 88v142Z"/><path d="M820 400V226l104-92 104 92v174Z"/>
      <path d="M1140 400V250l92-94 92 94v150Z"/><path d="M1480 400V232l100-90 100 90v168Z"/>
      <path d="M1820 400V252l90-92 90 92v148Z"/>
    </g>
    <rect y="300" width="2000" height="26" fill="#FFFFFF" opacity="0.16"/>
    <rect y="344" width="2000" height="20" fill="#FFFFFF" opacity="0.12"/>`),

  // Desert dunes
  frame('5', grad('5', [['0', '#FFE0A3'], ['0.5', '#F0A860'], ['1', '#A65B2B']]), `
    <circle cx="1640" cy="120" r="58" fill="#FFF0C4" opacity="0.9"/>
    <path d="M0 400V290c340-70 620 40 940 6s660-70 1060-24v128Z" fill="#D98A4A"/>
    <path d="M0 400V340c380-54 660 34 1000 6s620-40 1000-10v64Z" fill="#B96C33"/>
    <path d="M0 400V376c420-30 700 20 1080 6s520-14 920-2v20Z" fill="#8A4A22"/>`),

  // Dusk skyline
  (() => {
    const r = seeded(19)
    const towers = Array.from({ length: 22 }, (_, i) => {
      const w = 60 + Math.round(r() * 46)
      const h = 90 + Math.round(r() * 190)
      return `<rect x="${i * 90 + 6}" y="${400 - h}" width="${w}" height="${h}" fill="#141C33" opacity="0.9"/>`
    }).join('')
    const windows = Array.from({ length: 70 }, () => {
      const x = Math.round(r() * 1960)
      const y = Math.round(200 + r() * 170)
      return `<rect x="${x}" y="${y}" width="6" height="9" fill="#FFD98A" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`
    }).join('')
    return frame('6', grad('6', [['0', '#F9B48A'], ['0.5', '#C86A8E'], ['1', '#2B2150']]), `
      <circle cx="360" cy="150" r="54" fill="#FFE0B2" opacity="0.85"/>
      ${towers}${windows}`)
  })(),

  // Blossom
  (() => {
    const r = seeded(31)
    const petals = Array.from({ length: 34 }, () => {
      const x = Math.round(r() * 2000)
      const y = Math.round(r() * 360)
      const rx = 8 + r() * 12
      return `<ellipse cx="${x}" cy="${y}" rx="${rx.toFixed(0)}" ry="${(rx * 0.62).toFixed(0)}" transform="rotate(${(r() * 180).toFixed(0)} ${x} ${y})" fill="#FFFFFF" opacity="${(0.25 + r() * 0.5).toFixed(2)}"/>`
    }).join('')
    return frame('7', grad('7', [['0', '#FFE3EF'], ['0.5', '#F49AC1'], ['1', '#B5467E']]), `
      ${petals}
      <path d="M0 400V330c360-56 640 40 1000 8s640-52 1000-16v78Z" fill="#8E2F63" opacity="0.65"/>`)
  })(),

  // Aurora
  frame('8', grad('8', [['0', '#050B1E'], ['0.6', '#0C2140'], ['1', '#123A5C']]), `
    <path d="M0 210c300-120 560 60 860-20s560-110 1140-40v150H0Z" fill="#3CE6B0" opacity="0.28"/>
    <path d="M0 250c340-100 600 50 940-16s600-80 1060-30v126H0Z" fill="#4FD1FF" opacity="0.24"/>
    <path d="M0 300c300-70 620 40 980-10s560-50 1020-16v96H0Z" fill="#A78BFA" opacity="0.22"/>
    <path d="M0 400V352l460-30 540 34 480-26 520 30V400Z" fill="#030815"/>`),

  // Cloud peaks
  frame('9', grad('9', [['0', '#DCE9F5'], ['0.55', '#9BB8D4'], ['1', '#4B6784']]), `
    <path d="M0 400V230l380-140 300 150 260-96 320 168 380-120 360 148V400Z" fill="#7B97B7" opacity="0.6"/>
    <path d="M0 400V300l440-110 380 130 420-90 380 150 380-96V400Z" fill="#47617F"/>
    <rect y="270" width="2000" height="22" fill="#FFFFFF" opacity="0.3"/>
    <rect y="314" width="2000" height="18" fill="#FFFFFF" opacity="0.22"/>`),

  // Sunset lake
  frame('11', grad('11', [['0', '#FFD79A'], ['0.45', '#FF7E5F'], ['1', '#3B2A63']]), `
    <circle cx="1000" cy="222" r="86" fill="#FFEFC4"/>
    <rect y="286" width="2000" height="114" fill="#2B2450"/>
    <rect y="300" width="2000" height="8" fill="#FFEFC4" opacity="0.5"/>
    <rect y="322" width="2000" height="6" fill="#FFEFC4" opacity="0.34"/>
    <rect y="342" width="2000" height="5" fill="#FFEFC4" opacity="0.24"/>
    <rect y="360" width="2000" height="4" fill="#FFEFC4" opacity="0.16"/>`),

  // Meadow
  (() => {
    const r = seeded(53)
    const blades = Array.from({ length: 90 }, () => {
      const x = Math.round(r() * 2000)
      const h = 40 + Math.round(r() * 90)
      const bend = Math.round(r() * 30 - 15)
      return `<path d="M${x} 400q${bend} -${Math.round(h / 2)} ${bend * 2} -${h}" stroke="#1F4D2E" stroke-width="3" fill="none" opacity="${(0.35 + r() * 0.5).toFixed(2)}"/>`
    }).join('')
    return frame('12', grad('12', [['0', '#CDEEB4'], ['0.5', '#7CC46A'], ['1', '#2F6B3C']]), `
      <circle cx="1700" cy="110" r="54" fill="#FFF7C2" opacity="0.95"/>
      ${blades}`)
  })(),
]

/* ------------------------------------------------------------------ */
/* Official — soft gradients, calm shapes (Feishu "官方" style)         */
/* ------------------------------------------------------------------ */

const OFFICIAL_ART: string[] = [
  // Misty blue arc
  frame('13', grad('13', [['0', '#EAF2FF'], ['1', '#B7D3F8']]), `
    <circle cx="1500" cy="420" r="300" fill="#8FB8EE" opacity="0.35"/>
    <circle cx="1660" cy="420" r="180" fill="#6E9DE4" opacity="0.4"/>
    <circle cx="260" cy="60" r="70" fill="#FFFFFF" opacity="0.6"/>`),

  // Warm sand
  frame('14', grad('14', [['0', '#FFF6E8'], ['1', '#F6DFC0']]), `
    <circle cx="480" cy="430" r="260" fill="#EFCA9C" opacity="0.5"/>
    <circle cx="1640" cy="80" r="90" fill="#FFFFFF" opacity="0.7"/>
    <path d="M0 320c400-60 800 40 2000-20v100H0Z" fill="#E8B97F" opacity="0.35"/>`),

  // Mint band
  frame('15', grad('15', [['0', '#E7FBF4'], ['1', '#B9EDDD']]), `
    <path d="M0 260 2000 160v60L0 320Z" fill="#5EC8A2" opacity="0.45"/>
    <path d="M0 320 2000 220v50L0 370Z" fill="#2F9E7D" opacity="0.35"/>
    <circle cx="300" cy="140" r="46" fill="#FFFFFF" opacity="0.8"/>`),

  // Lilac dots
  frame('16', grad('16', [['0', '#F3F0FF'], ['1', '#D9CEFA']]), `
    ${Array.from({ length: 5 }, (_, row) => Array.from({ length: 14 }, (_, col) =>
      `<circle cx="${140 + col * 140}" cy="${70 + row * 66}" r="10" fill="#9F86F0" opacity="${(0.14 + ((row + col) % 4) * 0.1).toFixed(2)}"/>`).join('')).join('')}`),

  // Coral waves
  frame('17', grad('17', [['0', '#FFF1EC'], ['1', '#FCD5C6']]), `
    ${[0, 1, 2, 3].map(i => `<path d="M0 ${230 + i * 40}q250 -36 500 0t500 0 500 0 500 0" stroke="#F0906E" stroke-width="6" fill="none" opacity="${(0.5 - i * 0.1).toFixed(1)}"/>`).join('')}`),

  // Graphite grid
  frame('18', grad('18', [['0', '#F4F5F7'], ['1', '#DFE2E8']]), `
    ${Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${i * 50}" x2="2000" y2="${i * 50}" stroke="#C3C8D2" stroke-width="1"/>`).join('')}
    ${Array.from({ length: 25 }, (_, i) => `<line x1="${i * 84}" y1="0" x2="${i * 84}" y2="400" stroke="#C3C8D2" stroke-width="1"/>`).join('')}
    <circle cx="1600" cy="220" r="60" fill="#8A93A6" opacity="0.3"/>`),

  // Sky cloud
  frame('19', grad('19', [['0', '#E3F2FF'], ['1', '#AFD7F7']]), `
    <g fill="#FFFFFF" opacity="0.85">
      <ellipse cx="420" cy="230" rx="150" ry="52"/><ellipse cx="540" cy="200" rx="110" ry="44"/>
      <ellipse cx="1500" cy="150" rx="130" ry="46"/><ellipse cx="1620" cy="120" rx="90" ry="38"/>
    </g>`),

  // Cream arc
  frame('20', grad('20', [['0', '#FDF8EF'], ['1', '#F3E5CB']]), `
    <path d="M-100 400a700 700 0 0 1 1400 0Z" fill="#E4C98F" opacity="0.4"/>
    <path d="M900 400a700 700 0 0 1 1400 0Z" fill="#D9B878" opacity="0.3"/>
    <circle cx="1000" cy="180" r="40" fill="#FFFFFF" opacity="0.8"/>`),
]

/* ------------------------------------------------------------------ */
/* Work — checklists, calendars, charts                                */
/* ------------------------------------------------------------------ */

const WORK_ART: string[] = [
  // Checklist
  frame('21', grad('21', [['0', '#F0F6FF'], ['1', '#D8E7FB']]), `
    ${[0, 1, 2, 3].map(i => `
      <rect x="${420 + (i % 2) * 620}" y="${100 + Math.floor(i / 2) * 130}" width="520" height="86" rx="14" fill="#FFFFFF"/>
      <rect x="${450 + (i % 2) * 620}" y="${128 + Math.floor(i / 2) * 130}" width="30" height="30" rx="8" fill="${i < 2 ? '#5B8DEF' : '#C9D6EA'}"/>
      ${i < 2 ? `<path d="M${457 + (i % 2) * 620} ${143 + Math.floor(i / 2) * 130}l8 9 14-16" stroke="#FFFFFF" stroke-width="4" fill="none"/>` : ''}
      <rect x="${500 + (i % 2) * 620}" y="${134 + Math.floor(i / 2) * 130}" width="${300 - i * 40}" height="18" rx="9" fill="#D5E0F0"/>`).join('')}`),

  // Calendar
  frame('22', grad('22', [['0', '#FFFFFF'], ['1', '#EDF1F8']]), `
    <rect x="360" y="80" width="1280" height="240" rx="18" fill="#FFFFFF" stroke="#DCE3EE" stroke-width="2"/>
    <rect x="360" y="80" width="1280" height="56" rx="18" fill="#4C6EF5"/>
    <rect x="360" y="112" width="1280" height="24" fill="#4C6EF5"/>
    ${Array.from({ length: 4 }, (_, row) => Array.from({ length: 7 }, (_, col) =>
      `<rect x="${430 + col * 168}" y="${170 + row * 36}" width="96" height="22" rx="6" fill="${(row + col) % 3 ? '#E8EDF6' : '#C7D4F5'}"/>`).join('')).join('')}`),

  // Bar chart
  frame('23', grad('23', [['0', '#F2F7F2'], ['1', '#DDEBE0']]), `
    <line x1="400" y1="330" x2="1600" y2="330" stroke="#B7C9BB" stroke-width="3"/>
    ${[90, 150, 110, 200, 170, 240].map((h, i) => `
      <rect x="${480 + i * 180}" y="${330 - h}" width="90" height="${h}" rx="10" fill="${i === 5 ? '#3E9B6346' : '#3E9B63'}" opacity="${i === 5 ? 1 : 0.55 + i * 0.07}"/>`).join('')}
    <path d="M500 220 700 170 900 190 1100 120 1300 140 1500 80" stroke="#2C6E49" stroke-width="5" fill="none" stroke-dasharray="1 14" stroke-linecap="round"/>`),

  // Sticky notes
  frame('24', grad('24', [['0', '#FFFBEF'], ['1', '#F7ECCF']]), `
    <g transform="rotate(-4 500 220)"><rect x="300" y="110" width="260" height="200" fill="#FFD666"/><rect x="300" y="110" width="260" height="34" fill="#F4BE3A"/></g>
    <g transform="rotate(3 1000 220)"><rect x="880" y="130" width="260" height="200" fill="#8FD6B4"/><rect x="880" y="130" width="260" height="34" fill="#5CB88F"/></g>
    <g transform="rotate(-2 1500 220)"><rect x="1440" y="105" width="260" height="200" fill="#F7A8B8"/><rect x="1440" y="105" width="260" height="34" fill="#E87F95"/></g>`),

  // Mail
  frame('25', grad('25', [['0', '#EEF4FB'], ['1', '#CFE0F2']]), `
    <rect x="700" y="110" width="600" height="200" rx="16" fill="#FFFFFF"/>
    <path d="M700 126l300 130 300-130" stroke="#7FA8D9" stroke-width="8" fill="none"/>
    <circle cx="1560" cy="290" r="46" fill="#4C6EF5"/>
    <path d="M1542 290l14 14 24-28" stroke="#FFFFFF" stroke-width="7" fill="none"/>`),

  // Clock
  frame('26', grad('26', [['0', '#F5F3EE'], ['1', '#E2DCCF']]), `
    <circle cx="1000" cy="200" r="130" fill="#FFFFFF" stroke="#C9BFA8" stroke-width="10"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => {
      const a = (i / 12) * Math.PI * 2
      return `<line x1="${1000 + Math.sin(a) * 106}" y1="${200 - Math.cos(a) * 106}" x2="${1000 + Math.sin(a) * 118}" y2="${200 - Math.cos(a) * 118}" stroke="#B3A88E" stroke-width="5"/>`
    }).join('')}
    <line x1="1000" y1="200" x2="1000" y2="120" stroke="#5A5142" stroke-width="9" stroke-linecap="round"/>
    <line x1="1000" y1="200" x2="1064" y2="228" stroke="#5A5142" stroke-width="7" stroke-linecap="round"/>
    <circle cx="1000" cy="200" r="10" fill="#5A5142"/>`),

  // Folder
  frame('27', grad('27', [['0', '#FDF4E7'], ['1', '#F2DFC2']]), `
    <path d="M640 130h240l50 46h430a24 24 0 0 1 24 24v170a24 24 0 0 1-24 24H640a24 24 0 0 1-24-24V154a24 24 0 0 1 24-24Z" fill="#F0B45C"/>
    <path d="M616 210h768v160a24 24 0 0 1-24 24H640a24 24 0 0 1-24-24Z" fill="#F8D08A"/>
    <rect x="700" y="250" width="200" height="18" rx="9" fill="#E2A94E" opacity="0.7"/>
    <rect x="700" y="290" width="320" height="18" rx="9" fill="#E2A94E" opacity="0.5"/>`),

  // Kanban
  frame('28', grad('28', [['0', '#F1F4F9'], ['1', '#DCE3EE']]), `
    ${[0, 1, 2].map(col => `
      <rect x="${380 + col * 430}" y="90" width="360" height="240" rx="16" fill="#FFFFFF"/>
      <rect x="${404 + col * 430}" y="114" width="120" height="16" rx="8" fill="#A9B7CC"/>
      ${[0, 1].map(row => `
        <rect x="${404 + col * 430}" y="${152 + row * 80}" width="312" height="64" rx="10" fill="#EDF1F7"/>
        <rect x="${420 + col * 430}" y="${170 + row * 80}" width="${220 - col * 40}" height="12" rx="6" fill="${['#7C93B6', '#9FB3D1'][(row + col) % 2]}"/>`).join('')}`).join('')}`),
]

/* ------------------------------------------------------------------ */
/* Creative — playful abstract shapes                                  */
/* ------------------------------------------------------------------ */

const CREATIVE_ART: string[] = [
  // Abstract geometry
  frame('10', grad('10', [['0', '#8B7BF0'], ['0.55', '#5B45D6'], ['1', '#241A57']]), `
    <circle cx="360" cy="150" r="140" fill="#FFFFFF" opacity="0.14"/>
    <circle cx="1520" cy="270" r="180" fill="#FFB86B" opacity="0.22"/>
    <rect x="1180" y="60" width="220" height="220" rx="24" fill="#FFFFFF" opacity="0.12" transform="rotate(18 1290 170)"/>
    <path d="M760 330l130-210 130 210Z" fill="#FFFFFF" opacity="0.16"/>
    <circle cx="900" cy="110" r="34" fill="#FFE29A" opacity="0.9"/>`),

  // Pop dots
  (() => {
    const r = seeded(61)
    const colors = ['#FF6B6B', '#FFD93D', '#4ECDC4', '#5B45D6', '#FF9F45']
    return frame('29', grad('29', [['0', '#FFF6E9'], ['1', '#FFE8C7']]), `
      ${Array.from({ length: 46 }, () => {
        const x = Math.round(r() * 1960) + 20
        const y = Math.round(r() * 360) + 20
        return `<circle cx="${x}" cy="${y}" r="${(10 + r() * 26).toFixed(0)}" fill="${colors[Math.floor(r() * colors.length)]}" opacity="0.8"/>`
      }).join('')}`)
  })(),

  // Maze lines
  frame('30', grad('30', [['0', '#122036'], ['1', '#1E3A5F']]), `
    ${Array.from({ length: 7 }, (_, i) => `
      <path d="M${100 + i * 40} ${80 + i * 40}H${1900 - i * 60}V${140 + i * 40}H${200 + i * 40}" stroke="#4FC3F7" stroke-width="5" fill="none" opacity="${(0.9 - i * 0.09).toFixed(2)}"/>`).join('')}`),

  // Wave field
  frame('31', grad('31', [['0', '#0F3D3E'], ['1', '#072426']]), `
    ${Array.from({ length: 12 }, (_, i) => `
      <path d="M-20 ${60 + i * 30}q250 -30 500 0t500 0 500 0 500 0" stroke="#2DD4BF" stroke-width="4" fill="none" opacity="${(0.65 - i * 0.045).toFixed(2)}"/>`).join('')}`),

  // Color blocks
  frame('32', grad('32', [['0', '#FAFAFA'], ['1', '#ECECEC']]), `
    <rect x="0" y="0" width="660" height="400" fill="#F94144" opacity="0.85"/>
    <rect x="660" y="0" width="460" height="230" fill="#F3722C" opacity="0.85"/>
    <rect x="660" y="230" width="460" height="170" fill="#F8961E" opacity="0.85"/>
    <rect x="1120" y="0" width="880" height="150" fill="#90BE6D" opacity="0.85"/>
    <rect x="1120" y="150" width="440" height="250" fill="#43AA8B" opacity="0.85"/>
    <rect x="1560" y="150" width="440" height="250" fill="#577590" opacity="0.85"/>
    <circle cx="330" cy="200" r="70" fill="#FFFFFF" opacity="0.85"/>`),

  // Pixel blocks
  (() => {
    const r = seeded(71)
    const colors = ['#1D3557', '#457B9D', '#A8DADC', '#E63946', '#F1FAEE']
    return frame('33', grad('33', [['0', '#2B2D42'], ['1', '#14151F']]), `
      ${Array.from({ length: 64 }, () => {
        const x = Math.floor(r() * 20) * 100
        const y = Math.floor(r() * 4) * 100
        return `<rect x="${x}" y="${y}" width="100" height="100" fill="${colors[Math.floor(r() * colors.length)]}" opacity="${(0.25 + r() * 0.6).toFixed(2)}"/>`
      }).join('')}`)
  })(),

  // Rings
  frame('34', grad('34', [['0', '#FFF3F0'], ['1', '#FFD9CF']]), `
    ${[0, 1, 2, 3, 4].map(i => `
      <circle cx="${520 + i * 240}" cy="200" r="${130 - i * 18}" stroke="#E76F51" stroke-width="14" fill="none" opacity="${(0.9 - i * 0.12).toFixed(2)}"/>`).join('')}
    <circle cx="1700" cy="200" r="34" fill="#E76F51"/>`),

  // Bauhaus
  frame('35', grad('35', [['0', '#F5F0E8'], ['1', '#E8DFCE']]), `
    <path d="M300 400a180 180 0 0 1 360 0Z" fill="#E63946"/>
    <circle cx="1000" cy="220" r="130" fill="none" stroke="#1D3557" stroke-width="26"/>
    <path d="M1180 400l180-260 180 260Z" fill="#457B9D"/>
    <rect x="1520" y="120" width="160" height="160" fill="#F4A261" transform="rotate(45 1600 200)"/>
    <line x1="200" y1="90" x2="560" y2="90" stroke="#1D3557" stroke-width="18"/>`),
]

/* ------------------------------------------------------------------ */
/* Tech — circuits, grids, data                                        */
/* ------------------------------------------------------------------ */

const TECH_ART: string[] = [
  // Circuit board
  frame('36', grad('36', [['0', '#04182B'], ['1', '#0A2E4A']]), `
    ${Array.from({ length: 9 }, (_, i) => {
      const y = 50 + i * 38
      return `<path d="M0 ${y}H${600 + i * 90}l40 30H${1300 + (i % 3) * 120}" stroke="#1B4F72" stroke-width="4" fill="none"/>
      <circle cx="${600 + i * 90}" cy="${y}" r="7" fill="#4FC3F7" opacity="0.9"/>`
    }).join('')}
    <rect x="1500" y="120" width="220" height="160" rx="12" fill="none" stroke="#4FC3F7" stroke-width="4" opacity="0.8"/>`),

  // Vanishing grid
  frame('37', grad('37', [['0', '#0B0F2A'], ['1', '#1B1F4B']]), `
    ${Array.from({ length: 11 }, (_, i) => `<line x1="${1000 + (i - 5) * 60}" y1="200" x2="${1000 + (i - 5) * 420}" y2="400" stroke="#6C63FF" stroke-width="2" opacity="0.55"/>`).join('')}
    ${[0, 1, 2, 3, 4].map(i => `<line x1="0" y1="${210 + i * i * 12}" x2="2000" y2="${210 + i * i * 12}" stroke="#6C63FF" stroke-width="2" opacity="0.5"/>`).join('')}
    <circle cx="1000" cy="200" r="60" fill="#8B7BF0" opacity="0.5"/>`),

  // Data stream
  (() => {
    const r = seeded(83)
    return frame('38', grad('38', [['0', '#031A24'], ['1', '#06323F']]), `
      ${Array.from({ length: 34 }, () => {
        const x = Math.round(r() * 1980)
        const h = 30 + Math.round(r() * 140)
        return `<rect x="${x}" y="${360 - h}" width="14" height="${h}" rx="7" fill="#22D3EE" opacity="${(0.2 + r() * 0.7).toFixed(2)}"/>`
      }).join('')}`)
  })(),

  // Node network
  (() => {
    const r = seeded(97)
    const pts = Array.from({ length: 18 }, () => [Math.round(r() * 1900) + 50, Math.round(r() * 340) + 30])
    const lines = pts.flatMap((p, i) => pts.slice(i + 1).filter(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 420)
      .map(q => `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="#38BDF8" stroke-width="1.6" opacity="0.4"/>`)).join('')
    return frame('39', grad('39', [['0', '#0A1220'], ['1', '#101E38']]), `
      ${lines}
      ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="7" fill="#7DD3FC" opacity="0.9"/>`).join('')}`)
  })(),

  // Radar
  frame('40', grad('40', [['0', '#03150F'], ['1', '#07271B']]), `
    ${[60, 120, 180, 240].map(rr => `<circle cx="1450" cy="200" r="${rr}" stroke="#34D399" stroke-width="2" fill="none" opacity="0.45"/>`).join('')}
    <path d="M1450 200L1690 60A280 280 0 0 1 1690 340Z" fill="#34D399" opacity="0.14"/>
    <line x1="1450" y1="200" x2="1690" y2="60" stroke="#34D399" stroke-width="3" opacity="0.8"/>
    <circle cx="1330" cy="150" r="6" fill="#A7F3D0"/><circle cx="1560" cy="260" r="6" fill="#A7F3D0"/><circle cx="1620" cy="130" r="6" fill="#A7F3D0"/>
    ${Array.from({ length: 5 }, (_, i) => `<rect x="${120 + i * 90}" y="${280 - i * 34}" width="34" height="${80 + i * 34}" fill="#34D399" opacity="${(0.25 + i * 0.12).toFixed(2)}"/>`).join('')}`),

  // Chip
  frame('41', grad('41', [['0', '#0D1117'], ['1', '#161B2E']]), `
    <rect x="880" y="110" width="240" height="180" rx="16" fill="#1F2937" stroke="#60A5FA" stroke-width="4"/>
    <rect x="930" y="155" width="140" height="90" rx="8" fill="#60A5FA" opacity="0.35"/>
    ${Array.from({ length: 7 }, (_, i) => `
      <line x1="${820}" y1="${130 + i * 24}" x2="880" y2="${130 + i * 24}" stroke="#60A5FA" stroke-width="4"/>
      <line x1="1120" y1="${130 + i * 24}" x2="1180" y2="${130 + i * 24}" stroke="#60A5FA" stroke-width="4"/>`).join('')}
    <circle cx="1560" cy="200" r="60" fill="none" stroke="#60A5FA" stroke-width="2" opacity="0.4"/>
    <circle cx="1560" cy="200" r="90" fill="none" stroke="#60A5FA" stroke-width="2" opacity="0.25"/>`),

  // Light trails
  frame('42', grad('42', [['0', '#090A1A'], ['1', '#131638']]), `
    ${[0, 1, 2, 3].map(i => `
      <path d="M-50 ${320 - i * 60}S600 ${140 - i * 30} 1100 ${220 - i * 40} 1900 ${60 + i * 20} 2050 ${120 - i * 20}" stroke="${['#F472B6', '#818CF8', '#38BDF8', '#34D399'][i]}" stroke-width="6" fill="none" opacity="${(0.75 - i * 0.13).toFixed(2)}"/>`).join('')}`),

  // Terminal
  frame('43', grad('43', [['0', '#0C0C15'], ['1', '#171725']]), `
    <rect x="480" y="80" width="1040" height="240" rx="16" fill="#101320" stroke="#2E2E45" stroke-width="3"/>
    <circle cx="516" cy="112" r="9" fill="#FF5F56"/><circle cx="544" cy="112" r="9" fill="#FFBD2E"/><circle cx="572" cy="112" r="9" fill="#27C93F"/>
    <text x="520" y="180" font-family="monospace" font-size="30" fill="#4ADE80">$ blinko --done</text>
    <text x="520" y="226" font-family="monospace" font-size="30" fill="#8B8BA7">✓ notes synced</text>
    <rect x="520" y="252" width="18" height="30" fill="#4ADE80"/>`),
]

/** key 必须保持稳定：cover-1..12 是历史笔记引用，新增从 13 顺延。 */
const COVER_SOURCES: Array<{ art: string; category: CoverCategory }> = [
  ...SCENERY_ART.map(art => ({ art, category: 'scenery' as const })),
  ...OFFICIAL_ART.map(art => ({ art, category: 'official' as const })),
  ...WORK_ART.map(art => ({ art, category: 'work' as const })),
  ...CREATIVE_ART.map(art => ({ art, category: 'creative' as const })),
  ...TECH_ART.map(art => ({ art, category: 'tech' as const })),
]

// key 顺序 = 原数组顺序（1..12 风景）+ 新增 13..43
const KEY_ORDER: string[] = [
  ...SCENERY_ART.map((_, i) => `cover-${i + 1}`),
  ...OFFICIAL_ART.map((_, i) => `cover-${13 + i}`),
  ...WORK_ART.map((_, i) => `cover-${21 + i}`),
  ...CREATIVE_ART.map((_, i) => `cover-${29 + i}`),
  ...TECH_ART.map((_, i) => `cover-${37 + i}`),
]

export const DEFAULT_COVERS: DefaultCover[] = COVER_SOURCES.map((s, i) => ({
  key: KEY_ORDER[i]!,
  src: s.art,
  category: s.category,
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

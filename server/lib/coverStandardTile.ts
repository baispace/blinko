import sharp from "sharp";
import { coverPaletteColor } from "../../shared/lib/blogCoverText";

/** Deterministic, explicitly labelled fallback; never described as an AI image. */
export async function standardCoverTile(theme: string, palette: string): Promise<Buffer> {
  const color=coverPaletteColor(palette);
  const symbols: Record<string,string> = {
    retrieval:'<circle cx="460" cy="430" r="150" fill="none" stroke="url(#c)" stroke-width="78"/><path d="M575 550L730 710" stroke="url(#c)" stroke-width="84" stroke-linecap="round"/>',
    ai:'<path d="M512 245Q555 465 775 512Q555 555 512 780Q465 555 245 512Q465 465 512 245Z" fill="url(#c)"/>',
    reading:'<path d="M245 300Q380 255 505 325V745Q380 675 245 710ZM519 325Q645 255 779 300V710Q645 675 519 745Z" fill="url(#c)"/><path d="M512 330V725" stroke="white" stroke-width="16"/>',
    review:'<rect x="290" y="270" width="445" height="500" rx="48" fill="url(#c)"/><rect x="420" y="235" width="185" height="80" rx="30" fill="url(#c)"/><g stroke="white" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"><path d="M340 410L365 435L410 380M340 550L365 575L410 520M340 690L365 715L410 660"/><path d="M470 410H665M470 550H665M470 690H665"/></g>',
    workflow:'<path d="M295 515L450 670L745 355" fill="none" stroke="url(#c)" stroke-width="110" stroke-linecap="round" stroke-linejoin="round"/>',
    data:'<g fill="url(#c)"><rect x="280" y="545" width="115" height="200" rx="22"/><rect x="455" y="410" width="115" height="335" rx="22"/><rect x="630" y="275" width="115" height="470" rx="22"/></g>',
    product:'<path d="M330 250H610L725 365V720Q725 770 675 770H350Q300 770 300 720V300Q300 250 330 250Z" fill="url(#c)"/><path d="M600 255V370H715" fill="#ffffff" opacity=".45"/><g stroke="white" stroke-width="30" stroke-linecap="round"><path d="M390 470H630M390 570H630M390 670H540"/></g>',
  };
  const body=symbols[theme]??symbols.product;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="t" x2="1" y2="1"><stop stop-color="#fffefa"/><stop offset="1" stop-color="#edf0f8"/></linearGradient><linearGradient id="c" x2=".8" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".78"/></linearGradient><filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="12" stdDeviation="7" flood-color="${color}" flood-opacity=".18"/></filter></defs><rect x="62" y="76" width="900" height="886" rx="194" fill="#c6ccdf"/><rect x="62" y="62" width="900" height="886" rx="194" fill="url(#t)" stroke="white" stroke-width="8"/><g filter="url(#s)">${body}</g></svg>`;
  return sharp(Buffer.from(svg)).webp({quality:96,alphaQuality:100}).toBuffer();
}

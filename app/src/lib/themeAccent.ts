/** HeroUI stores HSL channels, while the app stores complete CSS colors. */
export function hslChannels(color: string): string | null {
  const hsl = color.match(/^hsl\(\s*([\d.]+)[, ]+([\d.]+%)[, ]+([\d.]+%)\s*\)$/i);
  if (hsl) return `${hsl[1]} ${hsl[2]} ${hsl[3]}`;
  let hex = color.replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(hex)) hex = hex.split('').map(char=>char+char).join('');
  if (!/^[\da-f]{6}$/i.test(hex)) return null;
  const [r,g,b] = [0,2,4].map(index=>parseInt(hex.slice(index,index+2),16)/255);
  const max=Math.max(r,g,b), min=Math.min(r,g,b), delta=max-min, light=(max+min)/2;
  const saturation=delta ? delta/(1-Math.abs(2*light-1)) : 0;
  let hue=0;
  if(delta) hue=60*(max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4);
  return `${Math.round((hue+360)%360)} ${+(saturation*100).toFixed(2)}% ${+(light*100).toFixed(2)}%`;
}

export function syncHeroAccent(element: HTMLElement) {
  for (const [source,target] of [['--primary','--heroui-primary'],['--primary-foreground','--heroui-primary-foreground']]) {
    const value=hslChannels(element.style.getPropertyValue(source).trim());
    if(value)element.style.setProperty(target,value);
    else element.style.removeProperty(target);
    if(source==='--primary') {
      if(value)element.style.setProperty('--heroui-focus',value);
      else element.style.removeProperty('--heroui-focus');
    }
  }
}

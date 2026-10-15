/** Fold only explicit process markup, never guess which answer paragraphs matter. */
export function splitAssistantContent(content: string) {
  const process: string[] = [];
  let inside: string | null = null;
  let answer = '';
  for (const part of content.split(/(```[\s\S]*?(?:```|$))/g)) {
    if (part.startsWith('```') && !inside) { answer += part; continue; }
    const tokens = part.split(/(<\/?(?:think|analysis)>)/gi);
    for (const token of tokens) {
      if (/^<(think|analysis)>$/i.test(token)) { inside = token.slice(1, -1).toLowerCase(); process.push(''); }
      else if (inside && token.toLowerCase() === `</${inside}>`) inside = null;
      else if (inside) process[process.length - 1] += token;
      else answer += token;
    }
  }
  return { answer: answer.trim(), process: process.filter(text => text.trim()).join('\n\n'), thinking: !!inside };
}

/** Models may return explicit reasoning before the title. Never use it as a label. */
export function cleanConversationTitle(value: string | null | undefined, fallback = '') {
  return (value ?? '')
    .replace(/<(think|analysis)>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(?:think|analysis)>[\s\S]*$/gi, '')
    .replace(/```[^\n]*\n?|```/g, '')
    .replace(/^[#\s"'“”]+|["'“”]+$/g, '')
    .trim().split('\n').find(line => line.trim())?.trim().slice(0, 80) || fallback;
}

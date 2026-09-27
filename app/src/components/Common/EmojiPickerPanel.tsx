import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';

/**
 * Isolated so `emoji-picker-react` (and its emoji dataset) only lands in a
 * lazily-loaded chunk — the picker is opened from a dialog, not on first paint.
 */
export const EmojiPickerPanel = ({ theme, onSelect }: { theme?: string, onSelect: (emoji: string) => void }) => {
  return (
    <div className='w-full'>
      <EmojiPicker
        width='100%'
        className='border-none'
        emojiStyle={EmojiStyle.NATIVE}
        theme={theme == 'dark' ? Theme.DARK : Theme.LIGHT}
        onEmojiClick={async e => onSelect(e.emoji)}
      />
    </div>
  );
};

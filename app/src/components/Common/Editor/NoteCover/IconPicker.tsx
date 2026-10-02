import { useMemo, useState } from 'react';
import { Input, Modal, ModalBody, ModalContent, ModalHeader, ScrollShadow } from '@heroui/react';
import { useTranslation } from 'react-i18next';

export const EMOJI_GROUPS: Array<{ name: string; emojis: string[] }> = [
  {
    name: 'common',
    emojis: [
      '💡', '📝', '📌', '🚀', '🔥', '⭐', '✨', '🎉',
      '❤️', '💔', '👍', '👏', '🙌', '🤝', '🎯', '🏆',
      '📊', '📈', '📉', '🗂️', '📚', '🔖', '🗒️', '📄',
      '💻', '⌨️', '🖥️', '📱', '🔧', '🛠️', '⚙️', '🔍',
    ],
  },
  {
    name: 'life',
    emojis: [
      '☀️', '🌙', '🌈', '☁️', '⛅', '❄️', '🌊', '🍀',
      '🌸', '🌿', '🍂', '🌵', '🐱', '🐶', '🐼', '🦊',
      '🍎', '🍜', '☕', '🍺', '🎂', '🎁', '🏠', '🚗',
    ],
  },
  {
    name: 'work',
    emojis: [
      '💼', '📅', '📎', '✏️', '📋', '🗓️', '💬', '📣',
      '🔔', '🔒', '🔑', '🗝️', '📦', '🏷️', '🧩', '🧠',
      '🤖', '🛰️', '🧪', '🧬', '🔬', '🔭', '⚡', '🌐',
    ],
  },
];

const GROUP_KEYWORDS: Record<string, string[]> = {
  common: ['common', 'frequent', '常用'],
  life: ['life', 'daily', '生活'],
  work: ['work', 'office', '工作'],
};

interface IconPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (emoji: string) => void
}

export const IconPicker = ({ isOpen, onClose, onSelect }: IconPickerProps) => {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return EMOJI_GROUPS;
    return EMOJI_GROUPS
      .map((group) => {
        // A group keyword ("life", "工作") yields the whole group; otherwise
        // only an exact emoji match survives, since the bundle carries no
        // searchable names for individual emojis.
        if ((GROUP_KEYWORDS[group.name] ?? []).some((n) => n.toLowerCase().includes(kw))) {
          return group;
        }
        const emojis = group.emojis.filter((e) => e === kw);
        return emojis.length ? { ...group, emojis } : null;
      })
      .filter((g): g is (typeof EMOJI_GROUPS)[number] => g !== null);
  }, [keyword]);

  const handlePick = (emoji: string) => {
    onSelect(emoji);
    setKeyword('');
    onClose();
  };

  return (
    // z-[10000]: above the fullscreen editor overlay (z-[9999]) so the picker
    // is never hidden behind it.
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hideCloseButton
      size="lg"
      placement="center"
      classNames={{ base: 'max-h-[80vh]', wrapper: 'z-[10000]' }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 pb-2">
          <span className="text-base font-bold">{t('select-icon')}</span>
        </ModalHeader>
        <ModalBody className="pb-3">
          <Input
            size="sm"
            variant="bordered"
            value={keyword}
            onValueChange={setKeyword}
            placeholder={t('search-emoji')}
          />
          <ScrollShadow className="max-h-[46vh]" hideScrollBar>
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-desc">{t('no-result')}</div>
            ) : (
              filtered.map((group) => (
                <div key={group.name} className="mb-3">
                  <div className="mb-1 text-xs text-desc">{t(group.name)}</div>
                  <div className="grid grid-cols-8 gap-1">
                    {group.emojis.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handlePick(emoji)}
                        className="flex items-center justify-center h-9 rounded-lg text-xl transition-colors hover:bg-default-100"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </ScrollShadow>
        </ModalBody>
        <div className="flex justify-end gap-2 px-6 pb-4">
          {/* Native button: HeroUI <Button onPress> no-ops inside modals here. */}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-foreground hover:bg-default-100 !transition-colors cursor-pointer"
          >{t('cancel')}</button>
        </div>
      </ModalContent>
    </Modal>
  );
};

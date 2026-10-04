import { observer } from 'mobx-react-lite';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '@/components/Common/Iconify/icons';
import { RootStore } from '@/store';

/**
 * Renders note link in the form [[id|title]] as a clickable card.
 */
export const NoteLink = observer(({ id, title }: { id: number; title: string }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isShareMode = location.pathname.includes('share');

  const handleClick = () => {
    if (isShareMode) return;
    // Navigate to the note
    navigate(`/?id=${id}`);
    RootStore.Get(BlinkoStore).curSelectedNoteId = id;
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-default-100 border border-default-200 cursor-pointer hover:bg-default-200 transition-colors ${
        isShareMode ? 'pointer-events-none opacity-75' : ''
      }`}
      onClick={handleClick}
    >
      <Icon icon="solar:file-bold" width={14} height={14} className="text-primary" />
      <span className="text-sm text-default-700 line-clamp-1">{title}</span>
    </span>
  );
});

/**
 * Preprocess markdown to convert [[id|title]] to link format that can be rendered.
 * This runs before ReactMarkdown processes the content.
 */
export const preprocessNoteLinks = (content: string): string => {
  if (!content) return content;

  // Match [[id|title]] pattern and convert to markdown link
  // The link text will be parsed to extract id and title
  return content.replace(/\[\[(\d+)\|([^\]]+)\]\]/g, (_, id, title) => {
    // Use a special href format that our a renderer can detect
    return `[${title}](blinko://note/${id})`;
  });
};

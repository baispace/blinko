import { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';
import type { Editor } from '@tiptap/core';
import { Popover, PopoverTrigger, PopoverContent, Button, Input } from '@heroui/react';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { eventBus } from '@/lib/event';

interface BlockCommentData {
  blockId: string;
  content: string;
  author: string;
  createdAt: Date;
}

/**
 * Block-level comment component.
 * Shows a comment icon next to the selected block and allows adding/viewing comments.
 */
export const BlockComment = observer(({ editor }: { editor: Editor }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [comments, setComments] = useState<BlockCommentData[]>([]);
  const [newComment, setNewComment] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState<string>('');

  // Listen for selection changes to detect block selection
  useEffect(() => {
    if (!editor) return;

    const handleSelectionChange = () => {
      const { selection } = editor.state;
      const { $from } = selection;

      // Get the current block's position
      const blockPos = $from.before($from.depth);
      const blockId = `block-${blockPos}`;

      if (blockId !== selectedBlockId) {
        setSelectedBlockId(blockId);
        // TODO: Load comments for this block from backend
        // setComments(loadComments(blockId));
      }
    };

    editor.on('selectionUpdate', handleSelectionChange);
    return () => {
      editor.off('selectionUpdate', handleSelectionChange);
    };
  }, [editor, selectedBlockId]);

  const handleAddComment = () => {
    if (!newComment.trim()) return;

    // TODO: Save to backend
    const comment: BlockCommentData = {
      blockId: selectedBlockId,
      content: newComment,
      author: 'Current User', // TODO: Get from auth
      createdAt: new Date(),
    };

    setComments([...comments, comment]);
    setNewComment('');
  };

  // Only show when a block is selected (not empty selection but not text selection either)
  const shouldShow = editor && !editor.state.selection.empty;

  if (!shouldShow) return null;

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen} placement="bottom-end">
      <PopoverTrigger>
        <button
          className="absolute -right-10 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-default-100 text-default-400 hover:text-default-600 transition-colors"
          title={t('add-comment')}
        >
          <Icon icon="mdi:comment-outline" width={16} height={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="p-3 space-y-3">
          <div className="text-sm font-medium">{t('block-comment')}</div>

          {/* Comments list */}
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {comments.length === 0 ? (
              <div className="text-sm text-default-400">{t('no-comments')}</div>
            ) : (
              comments.map((comment, index) => (
                <div key={index} className="bg-default-50 rounded p-2">
                  <div className="text-xs text-default-500 flex justify-between">
                    <span>{comment.author}</span>
                    <span>{comment.createdAt.toLocaleDateString()}</span>
                  </div>
                  <div className="text-sm mt-1">{comment.content}</div>
                </div>
              ))
            )}
          </div>

          {/* Add comment input */}
          <div className="flex gap-2">
            <Input
              size="sm"
              placeholder={t('add-comment-placeholder')}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
            />
            <Button size="sm" color="primary" onClick={handleAddComment}>
              <Icon icon="mdi:send" width={14} height={14} />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});

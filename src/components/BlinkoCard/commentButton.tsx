import Editor from '../Common/Editor';
import { useState } from 'react';
import { api } from '@/lib/trpc';
import { UserStore } from '@/store/user';
import { PromisePageState, PromiseState } from '@/store/standard/PromiseState';
import { type Comment } from '@/server/types';
import { Icon } from '@iconify/react';
import { Button, Tooltip, Chip } from '@nextui-org/react';
import { BlinkoStore } from '@/store/blinkoStore';
import { Note } from '@/server/types';
import { RootStore } from '@/store';
import dayjs from '@/lib/dayjs';
import { useTranslation } from 'react-i18next';
import { _ } from '@/lib/lodash';
import { useIsIOS } from '@/lib/hooks';
import { DialogStore } from '@/store/module/Dialog';
import { observer } from 'mobx-react-lite';
import { ScrollArea } from '../Common/ScrollArea';
import { MarkdownRender } from '../Common/MarkdownRender';
import { AnimatePresence, motion } from 'framer-motion';
import Avatar from "boring-avatars";

export const CommentButton = observer(({ blinkoItem, alwaysShow = false }: { blinkoItem: Note, alwaysShow?: boolean }) => {
  const { t } = useTranslation()
  const blinko = RootStore.Get(BlinkoStore);
  const [content, setContent] = useState('')
  const isIOSDevice = useIsIOS();
  const user = RootStore.Get(UserStore);

  const Store = RootStore.Local(() => ({
    reply: {
      id: null as number | null,
      name: ''
    },
    commentList: new PromisePageState({
      function: async ({ page, size }) => {
        const res = await api.comments.list.query({
          noteId: blinko.curSelectedNote?.id!,
          page,
          size,
          orderBy: 'desc'
        })
        return res.items
      }
    }),
    handleReply: (commentId: number, commentName: string) => {
      Store.reply = {
        id: commentId,
        name: commentName
      }
    },
    handleSendComment: new PromiseState({
      function: async ({ content }: { content: string }) => {
        if (!content.trim()) {
          return;
        }
        const params: any = {
          content,
          noteId: blinko.curSelectedNote?.id!
        }
        if (Store.reply.id) {
          params.parentId = Store.reply.id
        }
        await api.comments.create.mutate(params);

        await Store.commentList.resetAndCall({});
        setContent('');
        blinko.updateTicker++
      }
    }),
    handleDelete: new PromiseState({
      function: async (commentId: number) => {
        await api.comments.delete.mutate({ id: commentId });
        await Store.commentList.resetAndCall({});
      }
    }),
    safeUA: (ua: string) => {
      try {
        const _ua = JSON.parse(ua)
        return _ua.os.name + ' ' + _ua.browser.name
      } catch (error) {
        return ""
      }
    }
  }))


  const CommentContent = observer(() => {
    const comments: Comment['items'] = Store.commentList.value ?? [];

    return <div>
      {
        comments.length == 0 ? <div className="text-center text-gray-500 py-4">{t('no-comments-yet')}</div> :
          <ScrollArea disableAnimation className="md:max-h-[550px] max-h-[400px] overflow-y-auto -mt-4" onBottom={async () => {
            await Store.commentList.callNextPage({});
          }}>
            {comments?.map((comment: Comment['items'][0]) => (
              <div key={comment.id} className="mb-2 border-divider p-2 rounded-2xl bg-background">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {comment.account ? (
                      <>
                        <img src={comment.account.image} alt="" className="w-6 h-6 rounded-full" />
                        <span className="text-sm font-medium">{comment.account.nickname || comment.account.name}</span>
                        {String(comment.accountId) === String(blinkoItem.accountId) && (
                          <Chip size="sm" color="warning" variant="flat">{t('author')}</Chip>
                        )}
                      </>
                    ) : (
                      <>
                        <Avatar
                          size={20}
                          name={comment?.guestName || ''}
                          variant="beam"
                        />
                        <span className="text-sm font-medium">{comment?.guestName || ''}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      onPress={() => Store.handleReply(comment.id, comment.account?.nickname || comment.account?.name || comment.guestName || '')}
                    >
                      <Icon icon="akar-icons:comment" width="16" height="16" />
                    </Button>
                    {user.id === String(comment.accountId) && (
                      <Button
                        size="sm"
                        variant="light"
                        color="danger"
                        isIconOnly
                        onPress={() => Store.handleDelete.call(comment.id)}
                      >
                        <Icon icon="akar-icons:trash" width="16" height="16" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="p-2 -mt-2">
                  <MarkdownRender content={comment.content} />
                  <div className="text-xs text-desc mt-1 flex items-center gap-2">
                    <span>{dayjs(comment.createdAt).fromNow()}</span>
                    {Store.safeUA(comment?.guestUA ?? '') && (
                      <>
                        <span>·</span>
                        <span>from {Store.safeUA(comment?.guestUA ?? '')}</span>
                      </>
                    )}
                  </div>
                </div>

                {comment.replies && comment.replies.length > 0 && (
                  <div className="ml-8 mt-2 space-y-2">
                    {comment.replies.map((reply) => (
                      <div key={reply.id} className="pl-4 py-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {reply.account ? (
                              <>
                                <img src={reply.account.image} alt="" className="w-5 h-5 rounded-full" />
                                <span className="text-sm font-medium">{reply.account.nickname || reply.account.name}</span>
                                {String(reply.accountId) === String(blinkoItem.accountId) && (
                                  <Chip size="sm" color="primary" variant="flat">{t('Author')}</Chip>
                                )}
                              </>
                            ) : (
                              <>
                                <Avatar
                                  size={20}
                                  name={reply?.guestName || ''}
                                  variant="beam"
                                />
                                <span className="text-sm font-medium">{reply?.guestName || ''}</span>
                              </>
                            )}
                          </div>
                          {user.id === String(reply.accountId) && (
                            <Button
                              size="sm"
                              color="danger"
                              variant="light"
                              isIconOnly
                              onPress={() => Store.handleDelete.call(reply.id)}
                            >
                              <Icon icon="akar-icons:trash" width="16" height="16" />
                            </Button>
                          )}
                        </div>
                        <div className="text-sm mt-1">
                          {reply.content}
                          <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                            <span>{dayjs(reply.createdAt).fromNow()}</span>
                            {Store.safeUA(reply?.guestUA ?? '') && (
                              <>
                                <span>·</span>
                                <span>{t('from')} {Store.safeUA(reply?.guestUA ?? '')}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </ScrollArea>
      }
      <AnimatePresence>
        {
          Store?.reply?.id && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-between mt-3 p-2 bg-background rounded-lg"
            >
              <div className="text-sm text-yellow-500 font-bold">
                {t('reply-to')} <span className="">@{Store.reply.name}</span>
              </div>
              <Icon
                icon="material-symbols:close"
                className="cursor-pointer text-default-400 hover:text-default-500"
                width="18"
                onClick={() => Store.reply = {
                  id: null,
                  name: ''
                }}
              />
            </motion.div>
          )
        }
      </AnimatePresence>
      <div className="pt-3">
        <Editor
          mode='comment'
          content={content}
          onChange={setContent}
          onSend={async ({ content }) => {
            await Store.handleSendComment.call({ content })
          }}
          isSendLoading={Store.handleSendComment.loading.value}
          originFiles={[]}
          originReference={[]}
          hiddenToolbar
        />
      </div>
    </div>
  });

  return (
    <Tooltip content={t('comment')}>
      <div className="flex items-center gap-2">
        <Icon
          icon="akar-icons:comment"
          width="16"
          height="16"
          className={`cursor-pointer text-desc ml-2 ${isIOSDevice
            ? 'opacity-100'
            : `${alwaysShow ? '' : 'opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0 translate-x-1'}  `
            }`}
          onClick={async (e) => {
            e.stopPropagation()
            blinko.curSelectedNote = _.cloneDeep(blinkoItem)
            if (!blinko.curSelectedNote?.id) return;
            Store.commentList.resetAndCall({});
            let title = t('comment')
            if (blinkoItem?._count?.comments && blinkoItem?._count?.comments > 0) {
              title += ` (${blinkoItem?._count?.comments})`
            }
            RootStore.Get(DialogStore).setData({
              isOpen: true,
              size: 'lg',
              title,
              content: <CommentContent />
            });
          }}
        />
      </div>
    </Tooltip>
  );
});


export const CommentCount = observer(({ blinkoItem }: { blinkoItem: Note }) => {
  if (blinkoItem?._count?.comments == 0) return null;
  return <div className="flex items-center gap-1">
    <CommentButton blinkoItem={blinkoItem} alwaysShow={true} />
    <span className="text-sm text-desc">{blinkoItem?._count?.comments}</span>
  </div>
});

import { MarkdownRender } from '../Common/MarkdownRender';
import { Icon } from '../Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import type { ToolCall, ToolResult } from '@/store/aiStore';
export function AiProcessDetails({ process, toolCalls = [], toolResults = [], running = false }: { process: string; toolCalls?: ToolCall[]; toolResults?: ToolResult[]; running?: boolean }) {
  const { i18n } = useTranslation();
  const text = (zh: string, en: string) => i18n.language.startsWith('zh') ? zh : en;
  if (!process && !toolCalls.length) return null;
  return <details className="my-2 rounded-xl border border-default-100 text-default-500">
    <summary className="cursor-pointer px-3 py-2 text-xs select-none focus-visible:outline-primary">
      {running ? text('正在处理', 'Working') : text('查看处理过程', 'View process')}{toolCalls.length > 0 && ` · ${toolCalls.length} ${text('项操作', 'operations')}`}
    </summary>
    <div className="max-h-64 overflow-auto overscroll-contain border-t border-default-100 p-3 text-xs space-y-3">
      {process && <MarkdownRender content={process} />}
      {toolCalls.map(call => {
        const result = toolResults.find(item => item.toolCallId === call.toolCallId);
        const name = /search|query/i.test(call.toolName) ? text('查找信息', 'Search') : /upsert|create/i.test(call.toolName) ? text('创建内容', 'Create content') : /update/i.test(call.toolName) ? text('更新内容', 'Update content') : /delete/i.test(call.toolName) ? text('删除内容', 'Delete content') : text('工具操作', 'Tool operation');
        return <details key={call.toolCallId}><summary className="cursor-pointer flex gap-2 items-center"><Icon icon="tabler:tool" width="14" />{name}<span className="ml-auto text-default-400">{result ? text('已返回', 'Returned') : running ? text('进行中', 'Running') : text('无结果', 'No result')}</span></summary>
          <div className="mt-2 space-y-2"><p className="text-default-400">{call.toolName}</p><pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(call.args, null, 2)}</pre>{result && <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(result.result, null, 2)}</pre>}</div>
        </details>;
      })}
    </div>
  </details>;
}

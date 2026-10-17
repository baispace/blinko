import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from 'tiptap-markdown';
import { OutlineList, OutlineItem } from '../../../../app/src/components/Common/Editor/Tiptap/outline';
import { pastedOutline, parseOutlineClipboard } from '../../../../app/src/components/Common/Editor/Tiptap/pastedOutline';
import '../../../../app/src/components/Common/Editor/Tiptap/outline.css';
import '../../../../app/src/components/Common/Editor/Tiptap/tiptap.css';
import { notePreviewText } from '../../../../app/src/lib/notePreviewText';

const sample=`- **商业预测四步法：发现未来机遇**
  - 调研准备
  - 识别大势
  - 注意洞察
  - 采取行动
  - *工具示意图*
    ![image-1](https://api2.mubu.com/v3/document_image/5314947c-36be-464c-aea1-6881de2aa224-880044.jpg)

## **战略分析**
- **SWOT分析法：基于竞争环境和竞争条件的态势分析**
  - 优势
  - 劣势
  - 机会
  - 威胁
  - ***工具示意图***
    ![image-1](https://api2.mubu.com/v3/document_image/d24743de-e64d-410f-8401-59d2bb97ab34-880044.jpg)`;
const output=document.createElement('pre');document.body.prepend(output);
const results:string[]=[];
const check=(value:boolean,message:string)=>{if(!value)throw Error(message);results.push(`PASS ${message}`);output.textContent=results.join('\n');};
let editor:Editor;
const pasteText=(text:string)=>{
  const clipboardData=new DataTransfer();clipboardData.setData('text/plain',text);
  editor.view.dom.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}));
};
try {
  editor=new Editor({element:document.getElementById('root')!,extensions:[StarterKit,OutlineList,OutlineItem,Image,TaskList,TaskItem.configure({nested:true}),Markdown.configure({html:true,breaks:true,transformPastedText:true})],content:'<p></p>',editorProps:{
    clipboardTextParser:(text,context,plain)=>parseOutlineClipboard(editor,text,context,plain) as any,
    transformPasted:(slice,view,plain)=>plain || view.state.selection.$from.parent.type.spec.code?slice:pastedOutline(slice),
  }});
  pasteText(sample);
  const counts:Record<string,number>={};editor.state.doc.descendants(node=>{counts[node.type.name]=(counts[node.type.name]||0)+1;});
  check(counts.outlineList===4 && counts.outlineItem===12,'sample creates two nested outline groups');
  check(!counts.bulletList,'sample has no ordinary bullet lists');
  check(counts.heading===1 && counts.image===2,'heading and both images survive');
  check(editor.state.doc.textContent.includes('战略分析') && editor.state.doc.textContent.includes('采取行动'),'sample content survives');
  const markdown=editor.storage.markdown.getMarkdown();
  editor.commands.setContent(markdown);
  const reloaded=editor.getJSON();
  check(JSON.stringify(reloaded).includes('outlineList') && JSON.stringify(reloaded).includes('5314947c'),'outline and original image URL survive save/reload');
  check(parseOutlineClipboard(editor,'- literal',editor.state.selection.$from,true)===null,'explicit plain-text paste bypasses formatting');
  editor.commands.setContent('<pre><code>existing code</code></pre>');editor.commands.focus('end');editor.view.pasteText('\n- literal\n  - child');
  check(editor.state.doc.firstChild?.type.name==='codeBlock' && editor.state.doc.childCount===1,'code-block paste remains code');
  editor.commands.setContent('<p></p>');editor.commands.focus('start');
  editor.view.pasteHTML('<h2>Section</h2><ul><li><p>Parent</p><ul><li><p>Child</p></li></ul></li></ul>');
  check(editor.state.doc.child(1).type.name==='outlineList','rich HTML clipboard lists become outlines');
  editor.commands.setContent('<p></p>');editor.commands.focus('start');pasteText('1. First\n2. Second\n\n- [x] Done\n- [ ] Pending');
  const kinds:string[]=[];editor.state.doc.descendants(node=>{kinds.push(node.type.name);});
  check(kinds.includes('orderedList') && kinds.includes('taskList'),'numbered and task Markdown keep their types');
  editor.commands.setContent('- 文件标签\n  - 商业分析工具\n  - 投资分析\n- 主题类别\n  - 分析方法');
  check(editor.getJSON().content?.[0].type==='outlineList','AI-saved Markdown automatically becomes an outline on load');
  check(!JSON.stringify(editor.getJSON()).includes('bulletList'),'AI-saved nested branches all become outlines');
  check(notePreviewText('<div data-type="outline-block"><ul><li><p>主题</p><ul><li><p>子主题</p></li></ul></li></ul></div>').trim().startsWith('主题\n'),'HTML preview displays topic text');
  check(!notePreviewText('<div data-type="outline-block"><ul data-map-title="truncated').includes('<'),'truncated HTML preview hides markup');
  editor.commands.setContent('<ul data-type="outline" data-view="mindmap"><li data-type="outline-item"><p>One</p><ul data-type="outline"><li data-type="outline-item"><p>Two</p><ul data-type="outline"><li data-type="outline-item"><p>Three</p><ul data-type="outline"><li data-type="outline-item"><p>Four</p></li></ul></li></ul></li></ul></li></ul>');
  editor.view.dom.classList.add('tiptap');
  editor.commands.setContent(editor.getHTML().replace('<p>Three</p>','<p>结构思考力打破思维框架</p>').replace('<p>Four</p>','<p>应用结构:理解-&gt;重构-&gt;呈现</p>'));
  requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const edges=editor.view.dom.querySelector('.outline-view[data-map-root="true"] > .outline-viewport > .outline-map-stage > .outline-map-edges');
    check(edges?.childElementCount===4,'four levels have connected edges');
  })));
  output.textContent+='\nALL PASSED';
}catch(error){output.textContent+='\nFAIL '+String(error);document.body.dataset.failure='true';throw error;}

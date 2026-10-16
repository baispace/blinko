/** Isolated browser regression: no server, account, or real note mutations. */
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const project = process.env.BLINKO_PROJECT || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(project, 'package.json'));
const { build } = require('esbuild');
const appRequire = createRequire(resolve(project, 'app/package.json'));
const { chromium } = require('playwright');
const bundle = await build({
  stdin: {
    resolveDir: resolve(project, 'app'),
    contents: `
      import { Editor, mergeAttributes } from '@tiptap/core';
      import StarterKit from '@tiptap/starter-kit';
      import Image from '@tiptap/extension-image';
      import TaskList from '@tiptap/extension-task-list';
      import TaskItem from '@tiptap/extension-task-item';
      import { Markdown } from 'tiptap-markdown';
      import { closeHistory } from '@tiptap/pm/history';
      import { TextSelection } from '@tiptap/pm/state';
      import { OutlineList, OutlineItem } from './src/components/Common/Editor/Tiptap/outline';
      import { MarkdownBlankLine } from './src/components/Common/Editor/Tiptap/markdownBlankLine';
      import { MarkdownHardBreak } from './src/components/Common/Editor/Tiptap/markdownHardBreak';
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import ReactMarkdown from 'react-markdown';
      import rehypeRaw from 'rehype-raw';
      import { OutlineReadList, OutlineReadItem } from './src/components/Common/MarkdownRender/OutlineReader';
      window.closeHistory = closeHistory;
      window.selectText = (text, end = false) => {
        let found = false;
        window.editor.state.doc.descendants((node, pos) => {
          if (!found && node.isText && node.text.includes(text)) {
            window.editor.commands.setTextSelection(pos + (end ? node.text.length : 0));
            found = true;
          }
        });
        if (!found) throw Error('Missing text: ' + text);
      };
      window.mountEditor = (content = '<p></p>') => {
        window.editor?.destroy?.();
        document.querySelector('#editor').innerHTML = '';
        window.editor = new Editor({
          element: document.querySelector('#editor'),
          extensions: [
            StarterKit.configure({paragraph:false,hardBreak:false}), MarkdownBlankLine, MarkdownHardBreak,
            OutlineList, OutlineItem, TaskList, TaskItem.configure({nested:true}),
            Image.extend({renderHTML({HTMLAttributes}) {
              // Simulate the application's authenticated image display URL.
              const src = HTMLAttributes.src.startsWith('/api/') ? HTMLAttributes.src + '?token=display-only' : HTMLAttributes.src;
              return ['img', mergeAttributes(HTMLAttributes, {src})];
            }}),
            Markdown.configure({html:true,breaks:true,transformPastedText:false,transformCopiedText:false}),
          ], content,
        });
        window.editor.commands.focus('end');
        window.editor.view.focus();
        return window.editor.getJSON();
      };
      window.renderReading = markdown => {
        window.readerRoot ||= createRoot(document.querySelector('#reader'));
        window.readerRoot.render(React.createElement(ReactMarkdown, {
          rehypePlugins:[rehypeRaw], components: {
            ul: ({node,children,...props}) => node.properties.dataType==='outline'
              ? React.createElement(OutlineReadList,{initialView:node.properties.dataView,title:node.properties.dataMapTitle},children)
              : React.createElement('ul',props,children),
            li: ({node,children,...props}) => {
              if(node.properties.dataType!=='outline-item')return React.createElement('li',props,children);
              const blocks=node.children.filter(c=>c.type==='element');
              const branches=blocks.filter(c=>c.properties?.dataType==='outline');
              return React.createElement(OutlineReadItem,{
                initiallyCollapsed:String(node.properties.dataCollapsed)==='true',
                hasChildren:branches.length>0,bodyRows:blocks.length-branches.length,
              },children);
            },
          },
        }, markdown));
      };
    `,
  }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' },
  plugins: [{ name:'editor-workspace-dedupe', setup(build) {
    build.onResolve({filter:/^(?:@tiptap\/(?:core|pm)(?:\/.*)?|prosemirror-[^/]+|react(?:\/.*)?|react-dom(?:\/.*)?)$/}, args => ({path:appRequire.resolve(args.path)}));
  }}],
});
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control');
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const passed = [];
async function check(name, action) { await action(); passed.push(name); console.log(`PASS ${name}`); }
async function assertEditor(expression, name) {
  const okay = await page.evaluate(expression);
  if (!okay) throw Error(name);
}
try {
  await page.setContent('<html><body><h2>大纲与思维导图</h2><div id="editor" class="tiptap-wrap page-scroll"></div><div id="reader" class="markdown-body"></div></body></html>');
  await page.addStyleTag({ content: 'body{--foreground:#32323c;--muted-foreground:#71717a;--border:#e4e4e7;--accent:#f4f4f5;--radius:8px;font:16px/1.6 system-ui;color:#32323c;margin:32px;}.tiptap{outline:none;}#editor{max-width:1120px;}p{margin:0;} .markdown-body{margin-top:24px;}' });
  await page.addStyleTag({ content: await readFile(resolve(project, 'app/src/components/Common/Editor/Tiptap/tiptap.css'), 'utf8') });
  await page.addStyleTag({ content: await readFile(resolve(project, 'app/src/components/Common/Editor/Tiptap/outline.css'), 'utf8') });
  // Lazy screens can load the common editor stylesheet after outline.css.
  // Both orders must leave the custom dot and hit area intact.
  await page.addStyleTag({ content: await readFile(resolve(project, 'app/src/components/Common/Editor/Tiptap/tiptap.css'), 'utf8') });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await check('Typing - space creates outline', async () => {
    await page.evaluate(() => window.mountEditor());
    await page.keyboard.type('- ');
    await assertEditor(() => window.editor.getJSON().content[0].type === 'outlineList', 'Input rule');
  });
  await check('Enter / Tab / Shift-Tab; first topic Tab stays put', async () => {
    await page.keyboard.type('Parent'); await page.keyboard.press('Tab');
    await assertEditor(() => window.editor.getJSON().content[0].content.length === 1, 'First item Tab');
    await page.keyboard.press('Enter'); await page.keyboard.type('Child'); await page.keyboard.press('Tab');
    await assertEditor(() => window.editor.getJSON().content[0].content[0].content[1].type === 'outlineList', 'Indent');
    await page.keyboard.press('Shift+Tab');
    await assertEditor(() => window.editor.getJSON().content[0].content.length === 2, 'Outdent');
    await page.keyboard.press('Tab');
  });
  await check('Outline dot must not duplicate native list decoration or overlap text', async () => {
    const metrics = await page.evaluate(() => {
      const li=document.querySelector('#editor li[data-type="outline-item"]');
      const button=li.querySelector(':scope > .outline-toggle');
      const p=li.querySelector(':scope > .outline-content > p');
      const range=document.createRange();range.selectNodeContents(p);
      return {marker:getComputedStyle(li,'::before').content,buttonRight:button.getBoundingClientRect().right,textLeft:range.getBoundingClientRect().left,padding:getComputedStyle(li).paddingLeft};
    });
    if(metrics.marker!=='none' || metrics.buttonRight>metrics.textLeft)throw Error(JSON.stringify(metrics));
  });
  await check('Dot folds subtree, moves hidden cursor, and preserves content', async () => {
    await page.locator('#editor .outline-toggle').first().click();
    await assertEditor(() => window.editor.state.selection.$from.parent.textContent === 'Parent' && window.editor.getJSON().content[0].content[0].attrs.collapsed, 'Fold selection');
    await page.locator('#editor .outline-content > .outline-view').first().waitFor({state:'hidden'});
    await page.locator('#editor .outline-toggle').first().click();
  });
  await check('Toolbar and Cmd/Ctrl-backtick toggle editable map', async () => {
    await page.locator('#editor .outline-view-toggle').first().click();
    await assertEditor(() => window.editor.getJSON().content[0].attrs.view === 'mindmap', 'Toolbar toggle');
    await page.locator('#editor .outline-content > p').filter({ hasText: 'Child' }).click();
    await page.keyboard.press('End'); await page.keyboard.type(' edited');
    await assertEditor(() => window.editor.getText().includes('Child edited'), 'Mindmap edit');
    await page.keyboard.press(`${modifier}+\``);
    await assertEditor(() => window.editor.getJSON().content[0].attrs.view === 'outline', 'Keyboard toggle');
    await page.keyboard.press(`${modifier}+\``);
  });
  await check('Existing Markdown lists convert recursively without cursor/text loss', async () => {
    await page.evaluate(() => {
      window.mountEditor('Before\n\n- Parent **bold**\n  - Child\n    - Grandchild\n- Sibling\n\nAfter');
      window.selectText('Child');
      const before = window.editor.state.selection.from;
      if (!window.editor.commands.toggleOutline()) throw Error('Convert failed');
      if (window.editor.state.selection.from !== before) throw Error('Cursor moved');
      if (!window.editor.getText().includes('Grandchild')) throw Error('Text lost');
      let wrong = false;
      window.editor.state.doc.descendants(n => { if (n.type.name === 'bulletList' || n.type.name === 'listItem') wrong = true; });
      if (wrong) throw Error('Nested list not converted');
      if (!window.editor.commands.toggleOutlineView()) throw Error('Root view not found');
    });
  });
  await check('Images stay inside a topic; stored URLs exclude display token', async () => {
    await page.evaluate(() => {
      window.selectText('Child', true);
      window.editor.commands.setImage({src:'/api/file/topic.png',alt:'主题图片'});
      window.savedMarkdown = window.editor.storage.markdown.getMarkdown();
      if (window.savedMarkdown.includes('display-only')) throw Error('Display token persisted');
      const before = JSON.stringify(window.editor.getJSON());
      window.mountEditor(window.savedMarkdown);
      if (JSON.stringify(window.editor.getJSON()) !== before) throw Error('Image/map Markdown roundtrip');
      let inside = false;
      window.editor.state.doc.descendants((node,pos) => {
        if(node.type.name==='image')inside=window.editor.state.doc.resolve(pos).parent.type.name==='outlineItem';
      });
      if(!inside)throw Error('Image outside topic');
    });
  });
  await check('Enter after a selected image creates a sibling topic without moving media', async () => {
    await page.evaluate(() => {
      let pos;
      window.editor.state.doc.descendants((node,p) => { if(node.type.name==='image')pos=p; });
      window.editor.commands.setNodeSelection(pos);
      window.editor.view.focus();
    });
    await page.keyboard.press('Enter'); await page.keyboard.type('Image sibling');
    await assertEditor(() => {
      const { $from }=window.editor.state.selection;
      const item=$from.node($from.depth-1);
      return item.type.name==='outlineItem' && item.textContent==='Image sibling' && item.childCount===1;
    }, 'Image sibling');
    await page.evaluate(() => window.mountEditor(window.savedMarkdown));
  });
  await check('Two Enters exit a deeply nested outline, keeping other branches', async () => {
    await page.locator('#editor .outline-content > p').filter({hasText:'Grandchild'}).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await assertEditor(() => !window.editor.isActive('outlineList') && window.editor.getText().includes('Sibling') && window.editor.getText().includes('Grandchild'), 'Nested exit');
  });
  await check('Shift-Cmd/Ctrl-backtick creates an outline; undo/redo restores tree', async () => {
    await page.evaluate(() => window.mountEditor('<p>Shortcut</p>'));
    await page.locator('#editor .tiptap').click();
    await page.keyboard.press(`${modifier}+Shift+\``);
    await assertEditor(() => window.editor.isActive('outlineList'), 'Shortcut create');
    await page.evaluate(() => { window.editor.view.dispatch(window.closeHistory(window.editor.state.tr)); window.editor.commands.toggleOutlineView(); });
    await page.keyboard.press(`${modifier}+z`);
    await assertEditor(() => window.editor.getJSON().content[0].attrs.view === 'outline', 'Undo map');
    await page.keyboard.press(`${modifier}+Shift+z`);
    await assertEditor(() => window.editor.getJSON().content[0].attrs.view === 'mindmap', 'Redo map');
  });
  await check('Read-only editor allows presentation controls, without changing text', async () => {
    await page.evaluate(() => { window.mountEditor(window.savedMarkdown); window.editor.setEditable(false); });
    const before = await page.evaluate(() => window.editor.getText());
    await page.locator('#editor .outline-toggle').first().click();
    await page.locator('#editor .outline-view-toggle').first().click();
    if (await page.evaluate(() => window.editor.getText()) !== before) throw Error('Reading changed text');
  });
  await check('Reading/share renderer restores and locally toggles map and dots', async () => {
    await page.evaluate(() => window.renderReading(window.savedMarkdown));
    await page.locator('#reader .outline-view[data-view="mindmap"]').first().waitFor();
    await page.locator('#reader .outline-toggle').first().click();
    await page.locator('#reader .outline-content > .outline-view').first().waitFor({state:'hidden'});
    await page.locator('#reader .outline-toggle').first().click();
    await page.locator('#reader .outline-view-toggle').first().click();
    if (await page.locator('#reader .outline-view').first().getAttribute('data-view') !== 'outline') throw Error('Reader toggle');
  });
  await check('A new outline stays independent and toggles its own view', async () => {
    await page.evaluate(() => window.mountEditor());
    await page.keyboard.type('- First block');
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await page.keyboard.type('- Second block');
    await page.keyboard.press(`${modifier}+\``);
    await assertEditor(() => {
      const lists=window.editor.getJSON().content.filter(n=>n.type==='outlineList');
      return lists.length===2 && lists[0].attrs.view==='outline' && lists[1].attrs.view==='mindmap';
    }, 'Independent outlines');
  });
  await check('Numeric screenshot fixture: roots fold independently and reopen repeatedly', async () => {
    await page.evaluate(() => {
      window.mountEditor('- 123123\n  - 213123\n  - 1231231\n    - 深层子项\n  - 1231231\n- 31231123123\n  - 123');
      window.editor.commands.toggleOutline();
    });
    const roots=page.locator('#editor .outline-view').first().locator(':scope > .outline-viewport > .outline-map-stage > ul > li');
    for(let round=0;round<3;round++) {
      for(let index=0;index<2;index++) {
        const root=roots.nth(index);
        await root.locator(':scope > .outline-toggle').click();
        await root.locator(':scope > .outline-content > .outline-view').waitFor({state:'hidden'});
        if(await root.getAttribute('data-collapsed')!=='true')throw Error('Numeric fixture fold');
        if(await roots.nth(1-index).getAttribute('data-collapsed')!=='false')throw Error('Sibling was folded');
        await root.locator(':scope > .outline-toggle').click();
        await root.locator(':scope > .outline-content > .outline-view').waitFor({state:'visible'});
      }
    }
    const overlap=await page.evaluate(()=>[...document.querySelectorAll('#editor li[data-type="outline-item"]')].some(li=>{
      const button=li.querySelector(':scope > .outline-toggle');
      const p=li.querySelector(':scope > .outline-content > p');
      const range=document.createRange();range.selectNodeContents(p);
      return getComputedStyle(li,'::before').content!=='none' || button.getBoundingClientRect().right>range.getBoundingClientRect().left;
    }));
    if(overlap)throw Error('Numeric fixture marker overlap');
    if(process.env.OUTLINE_SCREENSHOTS) {
      await mkdir(process.env.OUTLINE_SCREENSHOTS,{recursive:true});
      await page.screenshot({path:resolve(process.env.OUTLINE_SCREENSHOTS,'outline-numeric-fixed.png'),fullPage:true});
    }
  });
  await check('Task lists and other content remain separate', async () => {
    await page.evaluate(() => {
      window.mountEditor('- [ ] Task\n\n1. Numbered\n\n# Heading');
      const names = window.editor.getJSON().content.map(n=>n.type);
      if(!names.includes('taskList') || !names.includes('orderedList') || !names.includes('heading'))throw Error('Existing types lost');
    });
  });
  await check('Deep map is horizontally scrollable and topic boxes do not overlap', async () => {
    await page.evaluate(() => {
      const p = text=>({type:'paragraph',content:[{type:'text',text}]});
      const item = (text,children=[])=>({type:'outlineItem',content:[p(text),...(children.length?[{type:'outlineList',content:children}]:[])]});
      let deep = item('最深层主题');
      for(let i=10;i>0;i--)deep=item('第 '+i+' 层',[deep]);
      window.mountEditor({type:'doc',content:[{type:'outlineList',attrs:{view:'mindmap'},content:[item('整理写作思路',[item('文章结构',[item('开头'),item('论证'),item('结尾')]),item('素材与灵感',[item('图片与文字'),item('引用资料')])]),deep]}]});
      window.editor.commands.blur();
      window.readerRoot?.unmount();
      document.querySelector('#reader').innerHTML = '';
    });
    await page.locator('#editor .outline-view[data-map-root="true"] > .outline-viewport > .outline-map-stage > .outline-map-edges > path').first().waitFor({state:'attached'});
    const geometry = await page.evaluate(() => {
      const viewport=document.querySelector('#editor .outline-view > .outline-viewport');
      const rects=[...document.querySelectorAll('#editor .outline-content > p')].map(el=>el.getBoundingClientRect());
      const overlap=rects.some((a,i)=>rects.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1));
      return {scrollable:viewport.scrollWidth>viewport.clientWidth,overlap};
    });
    if(!geometry.scrollable || geometry.overlap)throw Error(JSON.stringify(geometry));
    const output=process.env.OUTLINE_SCREENSHOTS;
    if(output){await mkdir(output,{recursive:true});await page.screenshot({path:resolve(output,'mindmap-desktop.png'),fullPage:true});
      await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(output,'mindmap-mobile.png'),fullPage:true});}
  });
  if(errors.length)throw Error(errors.join('\n'));
  console.log(`${passed.length} outline/mindmap checks passed.`);
} finally { await browser.close(); }

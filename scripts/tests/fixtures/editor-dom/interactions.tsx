import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { observer } from 'mobx-react-lite';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { SlashCommand } from '../../../../app/src/components/Common/Editor/Tiptap/extensions';
import { SlashMenuState } from '../../../../app/src/components/Common/Editor/Tiptap/slashMenuState';
import { AiTurnRail } from '../../../../app/src/components/BlinkoAi/AiTurnRail';
import '../../../../app/src/components/BlinkoAi/aiChat.css';
const menu = new SlashMenuState();
const Test = observer(() => {
  const [active,setActive] = useState(0);
  const editor = useEditor({extensions:[StarterKit, SlashCommand.configure({slashMenu:menu})],content:'<p>Existing /</p>'});
  return <main><h1>Slash and conversation navigation regression</h1>
    <button onClick={()=>editor?.chain().setContent('<p>Existing /</p>').focus('end').run()}>Focus existing slash</button>
    <button onClick={()=>editor?.chain().setContent('<p></p>').focus('start').run()}>Clear editor</button>
    <output aria-label="Slash menu state">{menu.isOpen ? 'OPEN' : 'CLOSED'}</output>
    <EditorContent editor={editor}/>
    <output>Selected turn: {active + 1}</output>
    <section style={{position:'relative',height:400,marginLeft:450}}><AiTurnRail activeIndex={active} onSelect={setActive} markers={Array.from({length:100},(_,index)=>({index,ratio:index/99,label:`Question ${index+1}`,time:'12:00'}))}/></section>
  </main>;
});
createRoot(document.getElementById('root')!).render(<Test/>);

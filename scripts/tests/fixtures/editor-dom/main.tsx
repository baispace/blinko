import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {EditorContent,BubbleMenu} from '@tiptap/react';
import {CollapsibleListItem} from '../../../../app/src/components/Common/Editor/Tiptap/collapsibleListItem';
import {EditorDocumentSurface,EditorBubbleSurface} from '../../../../app/src/components/Common/Editor/Tiptap/EditorSurface';
const failures:string[]=[];window.addEventListener('error',event=>{failures.push(event.message);document.body.dataset.failures=String(failures.length);});
function Test(){
 const [editor,setEditor]=useState(()=>new Editor({extensions:[StarterKit.configure({listItem:false}),CollapsibleListItem],content:'<p>Regression document</p>'}));
 const [show,setShow]=useState(false),[count,setCount]=useState(0);
 useEffect(()=>()=>editor.destroy(),[editor]);
 const unsafe=new URLSearchParams(location.search).has('unsafe');
 const Content=unsafe?EditorContent:EditorDocumentSurface,Menu=unsafe?BubbleMenu:EditorBubbleSurface;
 return <main><h1>Editor DOM regression</h1><button onClick={()=>{setShow(value=>!value);setCount(value=>value+1);}}>Toggle document layout</button><button onClick={()=>{editor.commands.insertContent('<ul><li><p>Parent</p><ul><li><p>Child</p></li></ul></li></ul>');setCount(value=>value+1);}}>Add outline branch</button><button onClick={()=>{editor.setEditable(!editor.isEditable);setCount(value=>value+1);}}>Toggle read mode</button><button onClick={()=>{setEditor(new Editor({extensions:[StarterKit.configure({listItem:false}),CollapsibleListItem],content:'<p>Replacement document</p>'}));setCount(value=>value+1);}}>Replace editor instance</button><output>Actions: {count}</output><section>{show&&<header>Cover and title</header>}<div style={{display:'flex'}}><aside>{show?'Document navigation':''}</aside><div><Content editor={editor}/><Menu editor={editor}><button>Selection format</button></Menu><div>{show?'Footer':''}</div></div></div></section></main>;
}
createRoot(document.getElementById('root')!).render(<Test/>);

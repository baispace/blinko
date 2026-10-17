import { expect, test } from 'bun:test';
import { Schema, Slice, Fragment } from '@tiptap/pm/model';
import { pastedOutline } from '../../app/src/components/Common/Editor/Tiptap/pastedOutline';
import { automaticOutline } from '../../app/src/components/Common/MarkdownRender/automaticOutline';

const schema=new Schema({nodes:{
  doc:{content:'block+'}, text:{group:'inline'},
  paragraph:{group:'block',content:'inline*'},
  heading:{group:'block',content:'inline*',attrs:{level:{default:2}}},
  image:{group:'block',attrs:{src:{},alt:{default:null}}},
  bulletList:{group:'block',content:'listItem+'},
  orderedList:{group:'block',content:'listItem+',attrs:{start:{default:1}}},
  listItem:{content:'paragraph block*'},
  outlineList:{group:'block',content:'outlineItem+',attrs:{view:{default:'outline'}}},
  outlineItem:{content:'paragraph block*',attrs:{collapsed:{default:false}}},
  taskList:{group:'block',content:'taskItem+'},
  taskItem:{content:'paragraph block*',attrs:{checked:{default:false}}},
  codeBlock:{group:'block',content:'text*',code:true},
},marks:{bold:{},italic:{}}});
const p=(text:string,marks:string[]=[])=>schema.node('paragraph',null,schema.text(text,marks.map(mark=>schema.mark(mark))));
const li=(...nodes:any[])=>schema.node('listItem',null,nodes);
const ul=(...items:any[])=>schema.node('bulletList',null,items);

test('nested pasted lists preserve headings, formatting and remote images',()=>{
  const image=schema.node('image',{src:'https://api2.mubu.com/v3/document_image/example.jpg',alt:'image-1'});
  const tree=ul(li(p('商业预测四步法',['bold']),ul(li(p('调研准备')),li(p('工具示意图',['bold','italic']),image))));
  const heading=schema.node('heading',{level:2},schema.text('战略分析',[schema.mark('bold')]));
  const source=new Slice(Fragment.fromArray([tree,heading,ul(li(p('SWOT分析法'),ul(li(p('优势')))))]),0,0);
  const result=pastedOutline(source);
  result.content.forEach(node=>node.check());
  const root=result.content.firstChild!;
  expect(root.type.name).toBe('outlineList');
  expect(root.firstChild!.type.name).toBe('outlineItem');
  expect(root.firstChild!.firstChild!.firstChild!.marks[0].type.name).toBe('bold');
  const children=root.firstChild!.child(1);
  expect(children.type.name).toBe('outlineList');
  expect(children.child(1).firstChild!.firstChild!.marks.map(mark=>mark.type.name)).toEqual(['bold','italic']);
  expect(children.child(1).child(1)).toBe(image);
  expect(result.content.child(1)).toBe(heading);
  expect(result.content.child(2).type.name).toBe('outlineList');
  expect(pastedOutline(result)).toBe(result);
});
test('ordered lists and tasks keep their semantics in mixed hierarchies',()=>{
  const ordered=schema.node('orderedList',{start:4},[li(p('步骤'))]);
  const tasks=schema.node('taskList',null,[schema.node('taskItem',{checked:true},p('已完成'))]);
  const input=new Slice(Fragment.from(ul(li(p('主题'),ordered,tasks))),0,0);
  const result=pastedOutline(input);
  result.content.firstChild!.check();
  expect(result.content.firstChild!.firstChild!.child(1)).toBe(ordered);
  expect(result.content.firstChild!.firstChild!.child(2)).toBe(tasks);
});
test('open clipboard slices retain depth and code is unchanged',()=>{
  const source=new Slice(Fragment.from(ul(li(p('子项')))),2,2);
  const result=pastedOutline(source);
  expect(result.openStart).toBe(2);expect(result.openEnd).toBe(2);
  expect(result.size).toBe(source.size);
  const code=new Slice(Fragment.from(schema.node('codeBlock',null,schema.text('- 不转换\n  - 子项'))),0,0);
  expect(pastedOutline(code)).toBe(code);
});
test('automatic recognition requires nested structure and preserves flat lists',()=>{
  const single=new Slice(Fragment.from(ul(li(p('单项')))),0,0);
  expect(pastedOutline(single,true)).toBe(single);
  const nested=new Slice(Fragment.from(ul(li(p('一级'),ul(li(p('二级'),ul(li(p('三级')))))))),0,0);
  const result=pastedOutline(nested,true);
  expect(JSON.stringify(result.toJSON())).not.toContain('bulletList');
  const flat=new Slice(Fragment.from(ul(li(p('一')),li(p('二')))),0,0);
  expect(pastedOutline(flat,true)).toBe(flat);
});
test('saved Markdown rendering recognizes hierarchy but preserves task lists',()=>{
  const el=(tagName:string,children:any[]=[],properties:any={})=>({type:'element',tagName,children,properties});
  const branch=el('ul',[el('li',[el('p'),el('ul',[el('li',[el('p')])])])]);
  const tasks=el('ul',[el('li',[],{className:['task-list-item']})],{className:['contains-task-list']});
  automaticOutline()({children:[branch,tasks]});
  expect(branch.properties.dataType).toBe('outline');
  expect(branch.children[0].children[1].properties.dataType).toBe('outline');
  expect(tasks.properties.dataType).toBeUndefined();
});

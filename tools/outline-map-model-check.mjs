/** Model checks only: no browser, server, account, or note mutations. */
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(project, 'app/package.json'));
const { build } = require('esbuild');
const bundle = await build({
  entryPoints: [resolve(project, 'app/src/components/Common/Editor/Tiptap/outlineMap.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{name:'canonical-pm',setup(build){build.onResolve({filter:/^@tiptap\/pm\//},args=>({path:require.resolve(args.path)}))}}],
});
const exports = {}, module = { exports };
new Function('module','exports','require',bundle.outputFiles[0].text)(module,exports,require);
const { moveOutlineBranch } = module.exports;
const { Schema } = require('@tiptap/pm/model');
const schema = new Schema({nodes:{
  doc:{content:'outlineList+'}, text:{group:'inline'}, paragraph:{content:'inline*',group:'block'},
  image:{group:'block',attrs:{src:{default:null}}},
  outlineList:{content:'outlineItem+',group:'block',attrs:{view:{default:'mindmap'},title:{default:'主题'}}},
  outlineItem:{content:'paragraph block*',attrs:{collapsed:{default:false}}},
},marks:{strong:{}}});
const p = text => schema.nodes.paragraph.create(null,schema.text(text,[schema.marks.strong.create()]));
const list = items => schema.nodes.outlineList.create(null,items);
const item = (text,children=[],extra=[]) => schema.nodes.outlineItem.create(null,[p(text),...extra,...(children.length?[list(children)]:[])]);
const leaf = item('叶子',[],[schema.nodes.image.create({src:'/api/file/raw.png'})]);
const a = item('A',[leaf]), b = item('B'), c = item('C');
const root = list([a,b,c]);
const labels = node => {const out=[];node.forEach(child=>out.push(child.firstChild.textContent));return out};
let next = moveOutlineBranch(root,c,a,'before'); next.check(); assert.deepEqual(labels(next),['C','A','B']);
next = moveOutlineBranch(root,a,c,'after');next.check();assert.deepEqual(labels(next),['B','C','A']);assert.equal(next.lastChild, a);
next = moveOutlineBranch(root,a,b,'child'); next.check();assert.deepEqual(labels(next),['B','C']);assert.equal(next.firstChild.lastChild.firstChild,a);
assert.equal(next.firstChild.lastChild.firstChild.lastChild.firstChild.lastChild.attrs.src,'/api/file/raw.png');
next = moveOutlineBranch(root,leaf,b,'child');next.check();assert.equal(next.firstChild.childCount,1);assert.equal(next.child(1).lastChild.firstChild,leaf);
assert.equal(leaf.firstChild.firstChild.marks[0].type.name,'strong');
assert.equal(moveOutlineBranch(root,a,leaf,'child'),null);assert.equal(moveOutlineBranch(root,a,a,'after'),null);
const closed = schema.nodes.outlineItem.create({collapsed:true},[p('关闭'),list([c])]);
next = moveOutlineBranch(list([a,closed]),a,closed,'child');next.check();assert.equal(next.firstChild.attrs.collapsed,false);
next = moveOutlineBranch(root,leaf,root,'child');next.check();assert.deepEqual(labels(next),['A','B','C','叶子']);assert.equal(next.firstChild.childCount,1);
next = moveOutlineBranch(root,leaf,a,'before');next.check();assert.deepEqual(labels(next),['叶子','A','B','C']);
assert.equal(moveOutlineBranch(root,c,root,'child'),null);
assert.equal(next.attrs.title,'主题');assert.equal(root.firstChild,a);assert.equal(root.childCount,3);
console.log('Passed: sibling order, reparenting, subtree/media/marks, empty-list cleanup, cycle prevention, target expansion, root attributes, immutability.');

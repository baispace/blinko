/** Recognize structured unordered lists in saved Markdown, including AI replies. */
export function automaticOutline() {
  return (tree: any) => {
    const walk = (node: any, inherited = false) => {
      const items = (node.children || []).filter((child: any) => child.tagName === 'li');
      const task = node.properties?.className?.includes('contains-task-list') || node.properties?.dataType === 'taskList' || items.some((item: any) => item.properties?.className?.includes('task-list-item'));
      const nested = (node.children || []).some(function hasList(child: any): boolean {
        return child.tagName === 'ul' || (child.children || []).some(hasList);
      });
      const outline = node.tagName === 'ul' && !task && (inherited || nested || node.properties?.dataType === 'outline');
      if (outline) {
        node.properties = { ...node.properties, dataType: 'outline' };
        items.forEach((item: any) => { item.properties = { ...item.properties, dataType: 'outline-item' }; });
      }
      (node.children || []).forEach((child: any) => walk(child, outline || (inherited && node.tagName === 'li')));
    };
    walk(tree);
  };
}

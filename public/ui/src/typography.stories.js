const markers = ['', 'bullet', 'tree', 'round-tree']
function typography({ marker }) {
  return `<h2>Heading <code>code</code></h2><p>Body text with <strong>strong text</strong>, <a href="#">a link</a>, and <code>inline code</code>.</p><blockquote>A useful quotation.</blockquote><ul${marker ? ` marker-="${marker}"` : ''}><li>First item</li><li>Second item</li></ul>`
}

export default { title: 'Components/Typography', render: typography, argTypes: { marker: { control: 'select', options: markers } } }
export const Default = { args: { marker: '' } }
export const RoundTree = { args: { marker: 'round-tree' } }

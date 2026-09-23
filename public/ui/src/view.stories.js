function view({ content, width, height }) {
  return `<div is-~="view" style="width: ${width}ch; height: ${height}lh" box-="square"><div is-~="view-content">${content}</div></div>`
}

export default { title: 'Components/View', render: view, argTypes: { width: { control: { type: 'number', min: 16 } }, height: { control: { type: 'number', min: 4 } } } }
export const Default = { args: { content: 'Centered view content', width: 32, height: 8 } }

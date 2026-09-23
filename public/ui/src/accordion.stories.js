function accordion({ summary, content, open }) {
  return `<details is-~="accordion"${open ? ' open' : ''}><summary>${summary}</summary><p>${content}</p></details>`
}

export default { title: 'Components/Accordion', render: accordion, argTypes: { open: { control: 'boolean' } } }
export const Default = { args: { summary: 'System details', content: 'Native details and summary styled as an accordion.', open: false } }

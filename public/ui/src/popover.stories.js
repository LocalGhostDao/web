function popover({ label, content, open }) {
  return `<details is-~="popover"${open ? ' open' : ''}><summary>${label}</summary><div box-="square">${content}</div></details>`
}

export default { title: 'Components/Popover', render: popover, argTypes: { open: { control: 'boolean' } } }
export const Default = { args: { label: 'Open popover', content: 'Popover content', open: false } }

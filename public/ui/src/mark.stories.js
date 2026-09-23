import { attribute } from './story-utils'

const colors = ['background0', 'background1', 'background2', 'background3', 'foreground0', 'foreground1', 'foreground2']
function mark({ label, background, foreground }) {
  return `<mark is-~="mark"${attribute('bg-', background)}${attribute('fg-', foreground)}>${label}</mark>`
}

export default { title: 'Components/Mark', render: mark, argTypes: { background: { control: 'select', options: colors }, foreground: { control: 'select', options: colors } } }
export const Default = { args: { label: 'Highlighted text', background: 'foreground0', foreground: 'background0' } }

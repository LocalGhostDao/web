import { attribute } from './story-utils'

const sizes = ['', 'small']
function preformatted({ content, size }) {
  return `<pre is-~="pre"${attribute('size-', size)}>${content}</pre>`
}

export default { title: 'Components/Pre', render: preformatted, argTypes: { size: { control: 'select', options: sizes } } }
export const Default = { args: { content: '$ status\nconnected: true', size: '' } }
export const Small = { args: { content: '$ status\nconnected: true', size: 'small' } }

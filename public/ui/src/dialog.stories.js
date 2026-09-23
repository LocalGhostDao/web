import { attribute } from './story-utils'

const sizes = ['small', 'default', 'full']
const positions = ['start start', 'center center', 'end end']
function dialog({ title, content, size, position }) {
  return `<dialog open${attribute('size-', size)}${attribute('position-', position)}><strong>${title}</strong><p>${content}</p><button type="button">Close</button></dialog>`
}

export default { title: 'Components/Dialog', render: dialog, argTypes: { size: { control: 'select', options: sizes }, position: { control: 'select', options: positions } } }
export const Default = { args: { title: 'Dialog', content: 'A native dialog styled with the component stylesheet.', size: 'small', position: 'center center' } }

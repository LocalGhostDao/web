import { attribute } from './story-utils'

const types = ['text', 'email', 'password', 'search', 'tel', 'url', 'number']
const sizes = ['', 'small', 'large']
function input({ type, placeholder, size, disabled }) {
  return `<input type="${type}" placeholder="${placeholder}"${attribute('size-', size)}${disabled ? ' disabled' : ''}>`
}

export default { title: 'Components/Input', render: input, argTypes: { type: { control: 'select', options: types }, size: { control: 'select', options: sizes }, disabled: { control: 'boolean' } } }
export const Default = { args: { type: 'text', placeholder: 'Enter a value', size: '', disabled: false } }
export const Small = { args: { type: 'email', placeholder: 'name@example.com', size: 'small', disabled: false } }
export const Large = { args: { type: 'search', placeholder: 'Search', size: 'large', disabled: false } }

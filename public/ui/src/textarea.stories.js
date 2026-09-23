import { attribute } from './story-utils'

const sizes = ['', 'small', 'large']
function textarea({ placeholder, size, disabled }) {
  return `<textarea is-~="textarea" placeholder="${placeholder}"${attribute('size-', size)}${disabled ? ' disabled' : ''}></textarea>`
}

export default { title: 'Components/Textarea', render: textarea, argTypes: { size: { control: 'select', options: sizes }, disabled: { control: 'boolean' } } }
export const Default = { args: { placeholder: 'Write a message', size: '', disabled: false } }
export const Large = { args: { placeholder: 'Write a message', size: 'large', disabled: false } }

import { attribute } from './story-utils'

const sizes = ['', 'small']
const bars = ['', 'thin', 'line']
function switchControl({ label, checked, size, bar, disabled }) {
  return `<label><input type="checkbox" is-="switch"${attribute('size-', size)}${attribute('bar-', bar)}${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}> ${label}</label>`
}

export default { title: 'Components/Switch', render: switchControl, argTypes: { checked: { control: 'boolean' }, size: { control: 'select', options: sizes }, bar: { control: 'select', options: bars }, disabled: { control: 'boolean' } } }
export const Default = { args: { label: 'Notifications', checked: false, size: '', bar: '', disabled: false } }
export const Checked = { args: { label: 'Notifications', checked: true, size: '', bar: '', disabled: false } }
export const Compact = { args: { label: 'Compact', checked: true, size: 'small', bar: 'line', disabled: false } }

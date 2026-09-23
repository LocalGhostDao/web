import { attribute } from './story-utils'

const bars = ['', 'thick', 'line']
function range({ label, value, bar, disabled }) {
  return `<label>${label}<input type="range" value="${value}"${attribute('bar-', bar)}${disabled ? ' disabled' : ''}></label>`
}

export default { title: 'Components/Range', render: range, argTypes: { value: { control: { type: 'range', min: 0, max: 100, step: 1 } }, bar: { control: 'select', options: bars }, disabled: { control: 'boolean' } } }
export const Default = { args: { label: 'Volume', value: 60, bar: '', disabled: false } }
export const Line = { args: { label: 'Volume', value: 60, bar: 'line', disabled: false } }

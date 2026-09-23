import { attribute } from './story-utils'

const variants = ['', 'dots', 'arrows', 'cross', 'square', 'pie', 'half', 'bar-vertical', 'bar-horizontal', 'cursor']
const speeds = ['slow', 'default', 'fast']
const directions = ['', 'reverse']
function spinner({ variant, speed, direction }) {
  return `<span is-="spinner"${attribute('variant-', variant)}${attribute('speed-', speed)}${attribute('direction-', direction)} aria-label="Loading"></span>`
}

export default { title: 'Components/Spinner', render: spinner, argTypes: { variant: { control: 'select', options: variants }, speed: { control: 'select', options: speeds }, direction: { control: 'select', options: directions } } }
export const Default = { args: { variant: '', speed: 'default', direction: '' } }
export const Dots = { args: { variant: 'dots', speed: 'slow', direction: '' } }
export const Cursor = { args: { variant: 'cursor', speed: 'fast', direction: 'reverse' } }

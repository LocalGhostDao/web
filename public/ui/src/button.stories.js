import './css/base.css'
import './css/utils/box.css'
import './css/components/button.css'

const variants = [
  'foreground0',
  'foreground1',
  'foreground2',
  'background0',
  'background1',
  'background2',
  'background3',
]
const sizes = ['small', 'default', 'large']
const boxes = ['', 'square', 'round', 'double']

function attribute(name, value) {
  return value ? ` ${name}="${value}"` : ''
}

function button({ label, variant, size, box, disabled }) {
  return `<button type="button"${attribute('variant-', variant)}${attribute('size-', size)}${attribute('box-', box)}${disabled ? ' disabled' : ''}>${label}</button>`
}

export default {
  title: 'Components/Button',
  render: button,
  argTypes: {
    variant: { control: 'select', options: variants },
    size: { control: 'select', options: sizes },
    box: { control: 'select', options: boxes },
    disabled: { control: 'boolean' },
  },
}

export const Default = {
  args: { label: 'Default', variant: 'foreground0', size: 'default', box: '', disabled: false },
}

export const Small = {
  args: { label: 'Small', variant: 'foreground1', size: 'small', box: '', disabled: false },
}

export const Large = {
  args: { label: 'Large', variant: 'foreground0', size: 'large', box: '', disabled: false },
}

export const Square = {
  args: { label: 'Square', variant: 'foreground0', size: 'default', box: 'square', disabled: false },
}

export const Round = {
  args: { label: 'Round', variant: 'foreground1', size: 'default', box: 'round', disabled: false },
}

export const Double = {
  args: { label: 'Double', variant: 'foreground2', size: 'large', box: 'double', disabled: false },
}

export const Disabled = {
  args: { label: 'Disabled', variant: 'foreground0', size: 'default', box: '', disabled: true },
}

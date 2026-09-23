const variants = ['primary', 'secondary', 'success', 'danger', 'outline-primary']
const sizes = ['', 'sm', 'lg']

function button({ label, variant, size, disabled }) {
  const classes = ['btn', `btn-${variant}`, size && `btn-${size}`]
    .filter(Boolean)
    .join(' ')

  return `<button class="${classes}" type="button"${disabled ? ' disabled' : ''}>${label}</button>`
}

export default {
  title: 'Components/Button',
  render: button,
  argTypes: {
    variant: { control: 'select', options: variants },
    size: { control: 'select', options: sizes },
    disabled: { control: 'boolean' },
  },
}

export const Primary = { args: { label: 'Primary', variant: 'primary', size: '', disabled: false } }
export const Secondary = { args: { label: 'Secondary', variant: 'secondary', size: '', disabled: false } }
export const Success = { args: { label: 'Success', variant: 'success', size: '', disabled: false } }
export const Danger = { args: { label: 'Danger', variant: 'danger', size: '', disabled: false } }
export const Outline = { args: { label: 'Outline', variant: 'outline-primary', size: '', disabled: false } }

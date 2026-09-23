import { attribute } from './story-utils'

const variants = ['foreground0', 'foreground1', 'foreground2', 'background0', 'background1', 'background2', 'background3']
const caps = ['', 'round', 'triangle', 'slant-top', 'slant-bottom', 'ribbon']
function badge({ label, variant, cap }) {
  return `<span is-~="badge"${attribute('variant-', variant)}${attribute('cap-', cap)}>${label}</span>`
}

export default { title: 'Components/Badge', render: badge, argTypes: { variant: { control: 'select', options: variants }, cap: { control: 'select', options: caps } } }
export const Default = { args: { label: 'Connected', variant: 'foreground0', cap: '' } }
export const Rounded = { args: { label: 'Connected', variant: 'foreground1', cap: 'round' } }
export const Ribbon = { args: { label: 'Queued', variant: 'foreground2', cap: 'ribbon' } }

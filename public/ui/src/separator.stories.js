import { attribute } from './story-utils'

const directions = ['horizontal', 'vertical']
const variants = ['foreground0', 'foreground1', 'foreground2', 'background1', 'background2', 'background3']
const caps = ['', 'bisect', 'edge']
function separator({ direction, variant, cap }) {
  const style = direction === 'vertical' ? 'height: 8lh' : 'width: 32ch'
  return `<span is-~="separator"${attribute('direction-', direction)}${attribute('variant-', variant)}${attribute('cap-', cap)} style="${style}"></span>`
}

export default { title: 'Components/Separator', render: separator, argTypes: { direction: { control: 'select', options: directions }, variant: { control: 'select', options: variants }, cap: { control: 'select', options: caps } } }
export const Default = { args: { direction: 'horizontal', variant: 'foreground1', cap: '' } }
export const Bisect = { args: { direction: 'horizontal', variant: 'foreground1', cap: 'bisect' } }

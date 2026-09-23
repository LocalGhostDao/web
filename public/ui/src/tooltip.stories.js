import { attribute } from './story-utils'

const positions = ['', 'top', 'right', 'bottom', 'left', 'baseline-top', 'baseline-bottom']
function tooltip({ label, content, position }) {
  return `<span is-~="tooltip"><button type="button" is-~="tooltip-trigger">${label}</button><span is-~="tooltip-content"${attribute('position-', position)}>${content}</span></span>`
}

export default { title: 'Components/Tooltip', render: tooltip, argTypes: { position: { control: 'select', options: positions } } }
export const Default = { args: { label: 'Hover or focus me', content: 'Helpful text', position: 'bottom' } }

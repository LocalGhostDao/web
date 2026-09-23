import { attribute } from './story-utils'

const divides = ['', 'vertical', 'horizontal', 'both']
const boxes = ['', 'square', 'round', 'double']
function table({ divide, box }) {
  return `<table${attribute('divide-', divide)}${attribute('box-', box)}><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody><tr><th scope="row">Status</th><td>Online</td></tr><tr><th scope="row">Region</th><td>London</td></tr></tbody></table>`
}

export default { title: 'Components/Table', render: table, argTypes: { divide: { control: 'select', options: divides }, box: { control: 'select', options: boxes } } }
export const Default = { args: { divide: '', box: '' } }
export const Divided = { args: { divide: 'both', box: 'square' } }

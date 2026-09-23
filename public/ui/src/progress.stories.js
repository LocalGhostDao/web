function progress({ value, max }) {
  return `<div is-~="progress" style="--progress-value: ${value}; --progress-max: ${max}" aria-label="Progress"></div>`
}

export default { title: 'Components/Progress', render: progress, argTypes: { value: { control: { type: 'range', min: 0, max: 100, step: 1 } }, max: { control: { type: 'number', min: 1 } } } }
export const Default = { args: { value: 65, max: 100 } }

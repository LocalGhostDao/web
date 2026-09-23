function radio({ label, checked, disabled }) {
  return `<label><input type="radio" name="radio-story"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}> ${label}</label>`
}

export default { title: 'Components/Radio', render: radio, argTypes: { checked: { control: 'boolean' }, disabled: { control: 'boolean' } } }
export const Default = { args: { label: 'Primary', checked: false, disabled: false } }
export const Selected = { args: { label: 'Primary', checked: true, disabled: false } }
export const Disabled = { args: { label: 'Unavailable', checked: false, disabled: true } }

function checkbox({ label, checked, disabled }) {
  return `<label><input type="checkbox" is-="checkbox"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}> ${label}</label>`
}

export default { title: 'Components/Checkbox', render: checkbox, argTypes: { checked: { control: 'boolean' }, disabled: { control: 'boolean' } } }
export const Default = { args: { label: 'Receive updates', checked: false, disabled: false } }
export const Checked = { args: { label: 'Receive updates', checked: true, disabled: false } }
export const Disabled = { args: { label: 'Unavailable', checked: false, disabled: true } }

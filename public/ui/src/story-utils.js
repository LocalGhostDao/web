export function attribute(name, value) {
  return value === '' || value === undefined || value === null ? '' : ` ${name}="${value}"`
}

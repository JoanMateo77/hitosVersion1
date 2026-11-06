/** "1 etapa" / "3 etapas": el número con la palabra en singular o plural. */
export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

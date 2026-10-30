/** Sum of the shares and what is left to 100 %. */
export const remainder = (values: Record<string, number>): number =>
  Math.round((100 - Object.values(values).reduce((a, b) => a + b, 0)) * 100) / 100;

export function runUserCode(req: { body: { formula: string } }) {
  const expression = req.body.formula;
  return eval(expression);
}

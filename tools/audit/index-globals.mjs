// Index des noms globaux par fichier (fonctions et constantes de premier niveau), avec leur ligne.
import fs from 'node:fs';
import * as acorn from 'acorn';
const files = fs.readdirSync('js').filter(f => f.endsWith('.js') && !/^i18n-\d/.test(f));
const order = [...fs.readFileSync('index.html', 'utf8').matchAll(/<script src="js\/([^"]+)"/g)].map(m => m[1]).filter(f => files.includes(f));
const onlyFns = process.argv.includes('--fns');
for (const f of order) {
  const src = fs.readFileSync('js/' + f, 'utf8');
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true }); }
  catch (e) { console.log(f + ' : ERREUR DE SYNTAXE ' + e.message); continue; }
  const fns = [], vars = [], re = [];
  const isFn = n => n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
  const walkTop = (body) => {
    for (const n of body) {
      if (n.type === 'FunctionDeclaration') fns.push(n.id.name + '@' + n.loc.start.line);
      else if (n.type === 'VariableDeclaration') for (const d of n.declarations) {
        if (d.id.type === 'Identifier') (isFn(d.init) ? fns : vars).push(d.id.name + '@' + d.loc.start.line);
        else if (d.id.type === 'ObjectPattern') for (const p of d.id.properties) if (p.value && p.value.type === 'Identifier') vars.push(p.value.name + '@' + d.loc.start.line);
      }
      else if (n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' && n.expression.left.type === 'Identifier') re.push(n.expression.left.name + '@' + n.loc.start.line);
      else if (n.type === 'BlockStatement') walkTop(n.body);
      else if (n.type === 'IfStatement' && n.consequent.type === 'BlockStatement') walkTop(n.consequent.body);
    }
  };
  walkTop(ast.body);
  console.log(`\n## ${f} (${src.split('\n').length} l.) — ${fns.length} fonctions, ${vars.length} variables, ${re.length} réaffectations`);
  console.log('fn: ' + fns.join(' '));
  if (!onlyFns) console.log('var: ' + vars.join(' '));
  if (re.length) console.log('RÉAFFECTE: ' + re.join(' '));
}

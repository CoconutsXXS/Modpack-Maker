import { Parser, Language} from 'web-tree-sitter';

async function initTreeSitter()
{
  await Parser.init();
  // locate wasm shipped by tree-sitter-wasms
  const wasmPath = await ipcInvoke("appDir") + sep() + 'node_modules/tree-sitter-wasms/out/tree-sitter-java.wasm';
  const Java = await Language.load(wasmPath);
  const parser = new Parser();
  parser.setLanguage(Java);
  return { parser, Java };
}

function findMatchingParen(str, pos)
{
  let depth = 0;
  const len = str.length;
  let inStr = false;
  let strChar = null;
  for (let i = pos; i < len; i++) {
    const ch = str[i];
    if (inStr) {
      if (ch === '\\' && i + 1 < len) { i++; continue; }
      if (ch === strChar) { inStr = false; strChar = null; }
      continue;
    } else {
      if (ch === '"' || ch === "'") { inStr = true; strChar = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

function splitTopLevelArgs(s)
{
  const args = [];
  let start = 0;
  let depth = 0;
  let inStr = false, strChar = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\' && i + 1 < s.length) { i++; continue; }
      if (ch === strChar) { inStr = false; strChar = null; }
      continue;
    } else {
      if (ch === '"' || ch === "'") { inStr = true; strChar = ch; continue; }
      if (ch === '(') { depth++; continue; }
      if (ch === ')') { depth--; continue; }
      if (ch === ',' && depth === 0) {
        args.push(s.slice(start, i).trim());
        start = i + 1;
      }
    }
  }
  if (start < s.length) args.push(s.slice(start).trim());
  return args;
}

function stripLeadingCasts(s)
{
  let i = 0;
  while (s[i] === '(') {
    const j = findMatchingParen(s, i);
    if (j === -1) break;
    // remove that cast and trim
    s = s.slice(j + 1).trim();
    i = 0;
  }
  return s;
}

// extract chained method calls that start from "BlockBehaviour.Properties.of()"
function extractPropertiesFromConstructorArg(constructorArg) {
  const anchor = 'BlockBehaviour.Properties.of()';
  const idx = constructorArg.indexOf(anchor);
  if (idx === -1) return null;
  let i = idx + anchor.length;
  const methods = {};
  // parse dot-chained calls: .name(args?)
  while (true) {
    // skip dots/spaces
    while (i < constructorArg.length && (constructorArg[i] === '.' || /\s/.test(constructorArg[i]))) i++;
    // read identifier
    const idStart = i;
    while (i < constructorArg.length && /[A-Za-z0-9_]/.test(constructorArg[i])) i++;
    if (i === idStart) break;
    const name = constructorArg.slice(idStart, i);
    // expect '('
    while (i < constructorArg.length && /\s/.test(constructorArg[i])) i++;
    if (i >= constructorArg.length || constructorArg[i] !== '(') {
      // no args? treat as empty array
      methods[name] = [];
      continue;
    }
    const argOpen = i;
    const argClose = findMatchingParen(constructorArg, argOpen);
    if (argClose === -1) break;
    const rawArgs = constructorArg.slice(argOpen + 1, argClose).trim();
    const parsedArgs = rawArgs.length ? splitTopLevelArgs(rawArgs) : [];
    methods[name] = parsedArgs;
    i = argClose + 1;
  }
  return methods;
}

async function parseBlocksFromSource(source) {
    // initialize tree-sitter (we don't heavily rely on the AST here,
    // but this matches your "use web-tree-sitter in ESM" requirement)
    await initTreeSitter();

    // Find every "Blocks.register(" occurrence and parse its argument list robustly
    const list = [];
    const needle = 'Blocks.register';
    let pos = 0;
    while (true)
    {
        const idx = source.indexOf(needle, pos);
        if (idx === -1) break;
        const paren = source.indexOf('(', idx + needle.length);
        if (paren === -1) break;
        const close = findMatchingParen(source, paren);
        if (close === -1) break;

        const inside = source.slice(paren + 1, close); // arguments inside Blocks.register(...)
        // split top-level args:
        const args = splitTopLevelArgs(inside);
        if (args.length >= 2)
        {
            // first argument is id string
            let id = null;
            const first = args[0].trim();
            const m = first.match(/^"(.*)"$/s);
            if (m) id = m[1];
            else
            {
                // sometimes they use var or constant - skip if not string
                id = first.replace(/^"|'|`|`$/g, '').trim();
            }

            // second argument: expression such as new Block(...), (Block)new GrassBlock(...), Blocks.log(...)
            let second = args[1].trim();
            second = stripLeadingCasts(second);

            // find block class if "new ClassName(" pattern
            let blockClass = null;
            const newMatch = second.match(/^new\s+([A-Za-z0-9_$.]+)\s*\(/);
            if (newMatch) blockClass = newMatch[1].split('.').pop();
            else
            {
                // maybe factory call like Blocks.log(...) or Blocks.leaves(...); try to extract name before '('
                const fm = second.match(/^([A-Za-z0-9_$.]+)\s*\(/);
                if (fm) blockClass = fm[1].split('.').pop();
            }

            // try to extract constructor args (content between the first '(' after the new/class/function name and its matching ')')
            let constructorArgs = null;
            const firstParen = second.indexOf('(');
            if (firstParen !== -1)
            {
                const closing = findMatchingParen(second, firstParen);
                if (closing !== -1) constructorArgs = second.slice(firstParen + 1, closing);
            }

            // try to extract BlockBehaviour.Properties chain inside constructor args
            let properties = null;
            if (constructorArgs)
            {
                const props = extractPropertiesFromConstructorArg(constructorArgs);
                if (props) {
                // user wanted properties as an array containing a single mapping object
                properties = [props];
                }
            }

            list.push({ id, blockClass, properties });
        }

        pos = close + 1;
  }

  return list;
}

export default async function parse(scriptString)
{
  const result = await parseBlocksFromSource(scriptString);
  return result;
}
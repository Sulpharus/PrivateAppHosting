// Code courses: one entry per programming language. Each level builds a practice text from
// templates with random names and numbers, so no two runs are the same. To add a language, add an
// entry to CODE_LANGUAGES with the same level ids (their titles live in the language packages
// under code.level.<id>).

export const CODE_LEVELS = [
  'symbols',
  'names',
  'values',
  'conditions',
  'loops',
  'functions',
  'classes',
  'idioms',
  'programs',
];

const NOUNS = [
  'user',
  'count',
  'total',
  'item',
  'price',
  'name',
  'index',
  'result',
  'value',
  'data',
  'order',
  'cart',
  'score',
  'limit',
  'offset',
  'buffer',
  'node',
  'config',
  'path',
  'size',
  'list',
  'key',
  'record',
  'message',
  'event',
  'level',
  'speed',
  'error',
  'file',
  'line',
  'word',
  'page',
  'task',
];
const VERBS = [
  'get',
  'set',
  'load',
  'save',
  'parse',
  'build',
  'find',
  'check',
  'update',
  'count',
  'sort',
  'send',
  'read',
  'format',
];
const CLASSES = [
  'User',
  'Order',
  'Account',
  'Session',
  'Parser',
  'Timer',
  'Counter',
  'Report',
  'Lesson',
  'Player',
];
const STRINGS = [
  'hello',
  'ready',
  'done',
  'error',
  'admin',
  'guest',
  'draft',
  'open',
  'closed',
  'typing',
];

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const int = (rng, max = 100) => Math.floor(rng() * max) + 1;
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Two different nouns as one identifier in the language's style. */
function ident(rng, style) {
  const a = pick(rng, NOUNS);
  let b = pick(rng, NOUNS);
  if (b === a) b = 'value';
  if (rng() < 0.4) return a;
  return style === 'snake' ? `${a}_${b}` : `${a}${cap(b)}`;
}
function fn(rng, style) {
  const v = pick(rng, VERBS);
  const n = pick(rng, NOUNS);
  return style === 'snake' ? `${v}_${n}` : `${v}${cap(n)}`;
}
function names(rng, style, n) {
  const out = new Set();
  while (out.size < n) out.add(ident(rng, style));
  return [...out];
}

/** Fills {a} {b} {c} {f} {C} {n} {m} {s} from the random generator. */
function fill(rng, style, template) {
  const [a, b, c] = names(rng, style, 3);
  const vars = {
    a,
    b,
    c,
    f: fn(rng, style),
    C: pick(rng, CLASSES),
    n: String(int(rng)),
    m: String(int(rng, 10)),
    s: pick(rng, STRINGS),
  };
  return template.replace(/\{([abcfCnms])\}/g, (_, k) => vars[k]);
}

const PY = {
  symbols: [
    '( )',
    '[ ]',
    '{ }',
    'x == y',
    'a != b',
    'n <= 10',
    'i += 1',
    'k // 2',
    'v ** 2',
    'a and b',
    'not ok',
    'f(x)',
    'd["key"]',
    'xs[1:3]',
    'x % 2',
    '-> int',
    'a: str',
    '"""',
    "'s'",
    '# note',
  ],
  values: [
    '{a} = {n}',
    '{a} = "{s}"',
    '{a} = [{n}, {m}, {n}]',
    '{a} = {"{s}": {n}}',
    '{a} = ({n}, {m})',
    '{a} = None',
    '{a} = True',
    '{a} += {b} * {m}',
    '{a} = {b} / {m}',
  ],
  conditions: [
    'if {a} > {n}:\n    {b} = {a} - {n}\nelse:\n    {b} = 0',
    'if not {a}:\n    return None',
    'if {a} == "{s}" and {b} < {m}:\n    {c} = True\nelif {b} >= {n}:\n    {c} = False',
    '{a} = {b} if {b} > {m} else {m}',
  ],
  loops: [
    'for i in range({n}):\n    {a} += i',
    'while {a} < {n}:\n    {a} *= 2',
    'for {a} in {b}:\n    if {a} is None:\n        continue\n    {c}.append({a})',
    'for i, {a} in enumerate({b}):\n    print(i, {a})',
  ],
  functions: [
    'def {f}({a}, {b}={m}):\n    return {a} * {b}',
    'def {f}({a}: list[int]) -> int:\n    return sum({a}) // len({a})',
    'def {f}(*args, **kwargs):\n    return len(args) + len(kwargs)',
  ],
  classes: [
    'class {C}:\n    def __init__(self, {a}):\n        self.{a} = {a}\n\n    def {f}(self):\n        return self.{a}',
    '@dataclass\nclass {C}:\n    {a}: str\n    {b}: int = {n}',
  ],
  idioms: [
    '{a} = [x * 2 for x in {b} if x > {m}]',
    '{a} = {k: v for k, v in {b}.items()}',
    'with open("{s}.txt") as f:\n    {a} = f.read()',
    'print(f"{{a}} = {{b}}")',
    'try:\n    {a} = int({b})\nexcept ValueError:\n    {a} = 0',
    '{a} = sorted({b}, key=lambda x: x.{c})',
  ],
  programs: [
    'def {f}({a}):\n    {b} = {}\n    for word in {a}.split():\n        {b}[word] = {b}.get(word, 0) + 1\n    return {b}',
    'import json\n\n\ndef {f}(path):\n    with open(path) as f:\n        {a} = json.load(f)\n    return [x for x in {a} if x["{s}"]]',
    'class {C}:\n    def __init__(self):\n        self.{a} = []\n\n    def add(self, {b}):\n        self.{a}.append({b})\n        return len(self.{a})',
  ],
};

const JS = {
  symbols: [
    '( )',
    '[ ]',
    '{ }',
    'a === b',
    'x !== y',
    'i++',
    'n -= 1',
    'a && b',
    'a || b',
    '!ok',
    '() => {}',
    'obj?.key',
    'a ?? b',
    '`${x}`',
    'x % 2',
    '...rest',
    'a[0]',
    '// note',
    "'s'",
    '<= >=',
  ],
  values: [
    'const {a} = {n};',
    "let {a} = '{s}';",
    'const {a} = [{n}, {m}, {n}];',
    'const {a} = { {s}: {n} };',
    'let {a} = null;',
    'const {a} = true;',
    '{a} += {b} * {m};',
    'const {a} = {b} / {m};',
  ],
  conditions: [
    'if ({a} > {n}) {\n  {b} = {a} - {n};\n} else {\n  {b} = 0;\n}',
    'if (!{a}) return null;',
    "if ({a} === '{s}' && {b} < {m}) {\n  {c} = true;\n} else if ({b} >= {n}) {\n  {c} = false;\n}",
    'const {a} = {b} > {m} ? {b} : {m};',
  ],
  loops: [
    'for (let i = 0; i < {n}; i++) {\n  {a} += i;\n}',
    'while ({a} < {n}) {\n  {a} *= 2;\n}',
    'for (const {a} of {b}) {\n  if ({a} == null) continue;\n  {c}.push({a});\n}',
    '{b}.forEach(({a}, i) => console.log(i, {a}));',
  ],
  functions: [
    'function {f}({a}, {b} = {m}) {\n  return {a} * {b};\n}',
    'const {f} = ({a}) => {a}.length;',
    'async function {f}(url) {\n  const res = await fetch(url);\n  return res.json();\n}',
  ],
  classes: [
    'class {C} {\n  constructor({a}) {\n    this.{a} = {a};\n  }\n\n  {f}() {\n    return this.{a};\n  }\n}',
    'class {C} extends Base {\n  #{a} = {n};\n\n  get {b}() {\n    return this.#{a};\n  }\n}',
  ],
  idioms: [
    'const {a} = {b}.filter((x) => x > {m}).map((x) => x * 2);',
    'const { {a}, {b} } = {c};',
    'const {a} = `${{b}} items`;',
    'const {a} = [...{b}, ...{c}];',
    'try {\n  {a} = JSON.parse({b});\n} catch {\n  {a} = {};\n}',
    'const {a} = {b}.reduce((sum, x) => sum + x, 0);',
  ],
  programs: [
    "function {f}(text) {\n  const {a} = {};\n  for (const word of text.split(' ')) {\n    {a}[word] = ({a}[word] ?? 0) + 1;\n  }\n  return {a};\n}",
    "export async function {f}() {\n  const res = await fetch('/api/{s}');\n  if (!res.ok) throw new Error('{s}');\n  return res.json();\n}",
    'class {C} {\n  #{a} = [];\n\n  add({b}) {\n    this.#{a}.push({b});\n    return this.#{a}.length;\n  }\n}',
  ],
};

const JAVA = {
  symbols: [
    '( )',
    '[ ]',
    '{ }',
    'a == b',
    'x != y',
    'i++',
    'n -= 1;',
    'a && b',
    'a || b',
    '!ok',
    'x -> x',
    'List<String>',
    'a[0]',
    '// note',
    '"s"',
    "'c'",
    'x % 2',
    '@Override',
    '::',
    '<= >=',
  ],
  values: [
    'int {a} = {n};',
    'String {a} = "{s}";',
    'int[] {a} = {{n}, {m}, {n}};',
    'var {a} = new ArrayList<Integer>();',
    'boolean {a} = true;',
    'double {a} = {n}.{m};',
    '{a} += {b} * {m};',
    'final long {a} = {n}L;',
  ],
  conditions: [
    'if ({a} > {n}) {\n    {b} = {a} - {n};\n} else {\n    {b} = 0;\n}',
    'if ({a} == null) {\n    return null;\n}',
    'if ("{s}".equals({a}) && {b} < {m}) {\n    {c} = true;\n} else if ({b} >= {n}) {\n    {c} = false;\n}',
    'int {a} = {b} > {m} ? {b} : {m};',
  ],
  loops: [
    'for (int i = 0; i < {n}; i++) {\n    {a} += i;\n}',
    'while ({a} < {n}) {\n    {a} *= 2;\n}',
    'for (String {a} : {b}) {\n    if ({a}.isEmpty()) continue;\n    {c}.add({a});\n}',
  ],
  functions: [
    'public static int {f}(int {a}, int {b}) {\n    return {a} * {b};\n}',
    'private boolean {f}(String {a}) {\n    return {a} != null && !{a}.isBlank();\n}',
    'static <T> List<T> {f}(List<T> {a}) {\n    return new ArrayList<>({a});\n}',
  ],
  classes: [
    'public class {C} {\n    private final String {a};\n\n    public {C}(String {a}) {\n        this.{a} = {a};\n    }\n\n    public String {f}() {\n        return {a};\n    }\n}',
    'public record {C}(String {a}, int {b}) {}',
  ],
  idioms: [
    'var {a} = {b}.stream().filter(x -> x > {m}).map(x -> x * 2).toList();',
    'Map<String, Integer> {a} = new HashMap<>();',
    'System.out.println("{s}: " + {a});',
    'try {\n    {a} = Integer.parseInt({b});\n} catch (NumberFormatException e) {\n    {a} = 0;\n}',
    '{a}.sort(Comparator.comparing({C}::{f}));',
  ],
  programs: [
    'public static Map<String, Integer> {f}(String text) {\n    Map<String, Integer> {a} = new HashMap<>();\n    for (String word : text.split(" ")) {\n        {a}.merge(word, 1, Integer::sum);\n    }\n    return {a};\n}',
    'public class {C} {\n    private final List<String> {a} = new ArrayList<>();\n\n    public int add(String {b}) {\n        {a}.add({b});\n        return {a}.size();\n    }\n}',
  ],
};

export const CODE_LANGUAGES = [
  { id: 'python', name: 'Python', style: 'snake', templates: PY },
  { id: 'javascript', name: 'JavaScript', style: 'camel', templates: JS },
  { id: 'java', name: 'Java', style: 'camel', templates: JAVA },
];

export function getCodeLanguage(id) {
  return CODE_LANGUAGES.find((l) => l.id === id) ?? CODE_LANGUAGES[0];
}

/** Target speed per level, in words per minute (code is slower than prose). */
export const codeTarget = (level) => 14 + level * 2;

/**
 * A practice text for one level of a language: about `chars` characters, snippets separated by a
 * blank line. Levels up to "names" are one line of tokens; later levels mix in earlier templates.
 */
export function codeText(lang, levelId, rng, chars = 260) {
  const t = lang.templates;
  if (levelId === 'symbols') return tokens(rng, t.symbols, chars);
  if (levelId === 'names') {
    const out = [];
    while (out.join(' ').length < chars * 0.8) {
      const r = rng();
      out.push(
        r < 0.4 ? ident(rng, lang.style) : r < 0.7 ? fn(rng, lang.style) : pick(rng, CLASSES),
      );
    }
    return out.join(' ');
  }
  const order = CODE_LEVELS.slice(2);
  const upto = order.indexOf(levelId);
  const pool = upto < 0 ? order : order.slice(0, upto + 1);
  const parts = [];
  let length = 0;
  let guard = 0;
  while (length < chars && guard++ < 20) {
    // Two of three snippets come from the level itself, the rest repeat earlier levels.
    const from = rng() < 0.67 || pool.length === 1 ? levelId : pick(rng, pool);
    const list = t[from] ?? t.values;
    const snippet = fill(rng, lang.style, pick(rng, list));
    parts.push(snippet);
    length += snippet.length;
  }
  const oneLine = parts.every((p) => !p.includes('\n'));
  return parts.join(oneLine ? '\n' : '\n\n');
}

function tokens(rng, list, chars) {
  const out = [];
  while (out.join(' ').length < chars * 0.7) out.push(pick(rng, list));
  return out.join(' ');
}

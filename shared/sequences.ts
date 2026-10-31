// Port de Gerar_Sequencias, Filtra_termo e Revisao_Carregar_Termos (a_Codigos, m_Revisao).

const MAX_GROUP = 10; // a planilha gera combinações de até 10 termos

function parseTerm(line: string): string[] {
  return line.split(";").map((raw) => {
    const term = raw.trim().toLowerCase().replaceAll('"', "");
    return term.includes(" ") ? `"${term}"` : term;
  }).filter(Boolean);
}

function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

/** Quantas sequências serão geradas, sem gerá-las (evita travar a aba com muitos sinônimos). */
export function countSequences(lines: string[]): number {
  const sizes = lines.map(parseTerm).filter((t) => t.length).map((t) => t.length);
  // Soma dos produtos de cada subconjunto de tamanho k = polinômio simétrico elementar.
  const elementary = [1, ...Array(sizes.length).fill(0)] as number[];
  for (const size of sizes) {
    for (let k = sizes.length; k >= 1; k--) elementary[k] += elementary[k - 1] * size;
  }
  return elementary.slice(1, MAX_GROUP + 1).reduce((sum, v) => sum + v, 0);
}

function* combinations(n: number, k: number, start = 0): Generator<number[]> {
  if (k === 0) { yield []; return; }
  for (let i = start; i <= n - k; i++) {
    for (const rest of combinations(n, k - 1, i + 1)) yield [i, ...rest];
  }
}

function* product(groups: string[][], index = 0): Generator<string[]> {
  if (index === groups.length) { yield []; return; }
  for (const item of groups[index]) {
    for (const rest of product(groups, index + 1)) yield [item, ...rest];
  }
}

/** Mesma ordem do VBA: dos grupos maiores para os menores, cada linha é um termo e ";" separa sinônimos. */
export function generateSequences(lines: string[]): string[] {
  const terms = lines.map(parseTerm).filter((t) => t.length);
  const output: string[] = [];
  for (let size = Math.min(MAX_GROUP, terms.length); size >= 1; size--) {
    for (const combo of combinations(terms.length, size)) {
      for (const picked of product(combo.map((i) => terms[i]))) output.push(picked.join(" AND "));
    }
  }
  return output;
}

export function normalizeQuery(query: string): string {
  return query.replace(/[“”]/g, '"').replaceAll('""', '"').trim();
}

/** Termos únicos das sequências marcadas, até 20 (limite das colunas O:AH de Tratamento). */
export function extractTerms(sequences: string[], limit = 20): string[] {
  const terms: string[] = [];
  for (const sequence of sequences) {
    for (const part of sequence.split(" AND ").flatMap((p) => p.split(" OR "))) {
      const term = part.replace(/["()]/g, "").trim();
      if (term && !terms.includes(term)) terms.push(term);
      if (terms.length === limit) return terms;
    }
  }
  return terms;
}

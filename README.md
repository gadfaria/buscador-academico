# Buscador Acadêmico

A web application for literature reviews, derived from the BUSCAd v2.8.2 spreadsheet. It generates search strings,
queries academic databases, removes duplicates, screens works using journal impact metrics, supports scoring by
multiple evaluators, and produces bibliometric summaries.

Based on the BUSCAd tool by Daniel Redinz Mansur and Renan Oliveira Altoé:

> MANSUR, D. R.; ALTOÉ, R. O. Ferramenta Tecnológica para Realização de Revisão de Literatura em Pesquisas
> Científicas. Revista Eletrônica Sala de Aula em Foco, v. 10, n. 1, p. 8-28, 2021.

The spreadsheet describes itself as "de uso livre, de código fechado" (free to use, closed source). Read the open
questions in [docs/ENGENHARIA-REVERSA.md](docs/ENGENHARIA-REVERSA.md), written in Portuguese, before publishing.

## Getting started

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. For production, run `npm run build` and then `npm start` (port `API_PORT`, default 8787).
Optional variables are listed in `.env.example` and must be exported in your environment.

## Tests

```bash
npm test
```

```bash
npx tsx tests/connectors.live.ts
```

The second command queries the real APIs and helps detect changes in the platforms.

## Journal database

`server/data/fatores.json` is extracted from the BD_Fatores sheet. It is not tracked by git because it contains
third-party metrics:

```bash
python3 scripts/extract_fatores.py "BUSCAd.xlsm"
```

## Project structure

- `shared/`: business rules ported from the VBA, with no dependencies and covered by tests.
- `server/`: connector proxy and journal metrics lookup.
- `src/`: React 19, Tailwind and shadcn/ui interface (`src/components/ui`). Each project lives in the browser's IndexedDB and can be saved as JSON.

## Interface guidelines

The audience includes professors and researchers who may have little familiarity with technology. The interface
itself is in Brazilian Portuguese.

- 17 px base text, buttons and fields of at least 44 px, and AA contrast or better for text.
- Numbered steps, with one sentence on each screen saying what to do.
- Buttons with text that describes the action, without relying on icons or hover.
- Plain language on screen: "Baixar planilha", not "exportar CSV". Confirmations say what will happen.
- No `window.confirm` or `alert`: use `confirm()` from `src/components/confirm.tsx` and `toast` from sonner.
- The score matrix uses a native `<select>` on purpose, since it can have up to 1,000 fields per page.

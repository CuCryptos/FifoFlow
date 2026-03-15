import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

type TableColumn = {
  cid: number;
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value: string | null;
  pk: 0 | 1;
};

type TableIndex = {
  seq: number;
  name: string;
  unique: 0 | 1;
  origin: string;
  partial: 0 | 1;
};

type TableSummary = {
  tableName: string;
  rowCount: number;
  columns: TableColumn[];
  indexes: Array<TableIndex & { columns: string[] }>;
};

function usage(): never {
  console.error('Usage: npx tsx scripts/inspect-sqlite-schema.ts <db-path> [label]');
  process.exit(1);
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const dbPath = process.argv[2];
const label = process.argv[3] ?? path.basename(dbPath ?? '', path.extname(dbPath ?? ''));

if (!dbPath) usage();
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const outDir = path.resolve(process.cwd(), 'docs/migration/generated');
fs.mkdirSync(outDir, { recursive: true });

const db = new Database(dbPath, { readonly: true });

const tables = db.prepare(`
  select name
  from sqlite_master
  where type = 'table'
    and name not like 'sqlite_%'
  order by name
`).all() as Array<{ name: string }>;

const summaries: TableSummary[] = tables.map(({ name }) => {
  const columns = db.prepare(`pragma table_info(${JSON.stringify(name)})`).all() as TableColumn[];
  const indexes = db.prepare(`pragma index_list(${JSON.stringify(name)})`).all() as TableIndex[];
  const rowCount = db.prepare(`select count(*) as count from "${name}"`).get() as { count: number };

  return {
    tableName: name,
    rowCount: rowCount.count,
    columns,
    indexes: indexes.map((index) => {
      const indexCols = db.prepare(`pragma index_info(${JSON.stringify(index.name)})`).all() as Array<{ name: string }>;
      return {
        ...index,
        columns: indexCols.map((col) => col.name),
      };
    }),
  };
});

db.close();

const payload = {
  label,
  sourcePath: path.resolve(dbPath),
  generatedAt: new Date().toISOString(),
  tableCount: summaries.length,
  tables: summaries,
};

const slug = toSlug(label);
const jsonPath = path.join(outDir, `${slug}-schema-summary.json`);
const mdPath = path.join(outDir, `${slug}-schema-summary.md`);

fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

const mdLines: string[] = [];
mdLines.push(`# SQLite Schema Summary: ${label}`);
mdLines.push('');
mdLines.push(`- Source: \`${path.resolve(dbPath)}\``);
mdLines.push(`- Generated: \`${payload.generatedAt}\``);
mdLines.push(`- Tables: \`${payload.tableCount}\``);
mdLines.push('');

for (const table of summaries) {
  mdLines.push(`## ${table.tableName}`);
  mdLines.push('');
  mdLines.push(`- Row count: \`${table.rowCount}\``);
  mdLines.push('');
  mdLines.push('| Column | Type | Not Null | Default | PK |');
  mdLines.push('|---|---|---:|---|---:|');
  for (const column of table.columns) {
    mdLines.push(
      `| ${column.name} | ${column.type || ''} | ${column.notnull} | ${column.dflt_value ?? ''} | ${column.pk} |`
    );
  }
  mdLines.push('');
  if (table.indexes.length > 0) {
    mdLines.push('| Index | Unique | Origin | Partial | Columns |');
    mdLines.push('|---|---:|---|---:|---|');
    for (const index of table.indexes) {
      mdLines.push(
        `| ${index.name} | ${index.unique} | ${index.origin} | ${index.partial} | ${index.columns.join(', ')} |`
      );
    }
    mdLines.push('');
  }
}

fs.writeFileSync(mdPath, mdLines.join('\n'));

console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${mdPath}`);

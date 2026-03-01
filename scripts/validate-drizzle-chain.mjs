import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve("drizzle");
const META_DIR = path.resolve("drizzle/meta");
const JOURNAL_PATH = path.join(META_DIR, "_journal.json");
const ALLOWED_LEGACY_DUPLICATE_INDEXES = new Set([24, 25]);

function fail(message) {
  console.error(`[drizzle:validate] ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`Cannot parse JSON ${filePath}: ${message}`);
  }
}

if (!fs.existsSync(MIGRATIONS_DIR)) fail("Missing drizzle directory");
if (!fs.existsSync(META_DIR)) fail("Missing drizzle/meta directory");
if (!fs.existsSync(JOURNAL_PATH)) fail("Missing drizzle/meta/_journal.json");

const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort();

if (migrationFiles.length === 0) fail("No migration files found in drizzle/");

const parsedMigrations = migrationFiles.map((file) => {
  const match = file.match(/^(\d{4})_(.+)\.sql$/);
  if (!match) fail(`Invalid migration filename format: ${file}`);
  return {
    file,
    index: Number.parseInt(match[1], 10),
    tag: `${match[1]}_${match[2]}`,
  };
});

const indexToFiles = new Map();
for (const migration of parsedMigrations) {
  const files = indexToFiles.get(migration.index) ?? [];
  files.push(migration.file);
  indexToFiles.set(migration.index, files);
}

for (const [index, files] of indexToFiles.entries()) {
  if (files.length <= 1) continue;
  if (!ALLOWED_LEGACY_DUPLICATE_INDEXES.has(index)) {
    fail(`Duplicate migration index ${String(index).padStart(4, "0")} detected: ${files.join(", ")}`);
  }
  console.warn(
    `[drizzle:validate] legacy duplicate index preserved (${String(index).padStart(4, "0")}): ${files.join(", ")}`,
  );
}

const maxMigration = parsedMigrations.reduce((max, curr) => (curr.index > max.index ? curr : max));

const journal = readJson(JOURNAL_PATH);
if (journal.dialect !== "postgresql") {
  fail(`Invalid meta journal dialect: expected "postgresql", got "${journal.dialect}"`);
}
if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
  fail("Meta journal entries are empty");
}

const lastEntry = journal.entries[journal.entries.length - 1];
if (Number(lastEntry.idx) !== maxMigration.index) {
  fail(
    `Meta journal last idx (${lastEntry.idx}) does not match latest migration index (${maxMigration.index})`,
  );
}
if (String(lastEntry.tag) !== maxMigration.tag) {
  fail(`Meta journal last tag (${lastEntry.tag}) does not match latest migration tag (${maxMigration.tag})`);
}

const snapshotFile = path.join(META_DIR, `${String(maxMigration.index).padStart(4, "0")}_snapshot.json`);
if (!fs.existsSync(snapshotFile)) {
  fail(`Missing latest snapshot file: ${path.relative(process.cwd(), snapshotFile)}`);
}

const snapshot = readJson(snapshotFile);
if (snapshot.dialect !== "postgresql") {
  fail(`Latest snapshot dialect is not postgresql: ${snapshot.dialect}`);
}

console.log(
  `[drizzle:validate] OK - latest migration ${maxMigration.tag}, snapshot ${path.basename(snapshotFile)}, dialect postgresql`,
);

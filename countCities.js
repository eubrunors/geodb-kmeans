import fs from "fs";

const file = "cities_backup.json";

if (!fs.existsSync(file)) {
  console.log("❌ Arquivo cities_backup.json não encontrado.");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, "utf-8"));

// Contagem total
const total = data.length;

// Verificar duplicatas por ID
const ids = data.map(city => city.id);
const uniqueIds = new Set(ids);

console.log("📊 Resultado da análise:");
console.log(`➡️ Total de cidades: ${total}`);
console.log(`➡️ Cidades únicas (por id): ${uniqueIds.size}`);

if (total === uniqueIds.size) {
  console.log("✅ Não há cidades repetidas.");
} else {
  console.log(`⚠️ Há ${total - uniqueIds.size} cidades repetidas.`);
}

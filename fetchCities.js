import fs from "fs";

const API_URL = "https://wft-geo-db.p.rapidapi.com/v1/geo/cities";
const API_KEY = "248809b291msh732d40c76e7212bp18200djsne9d03e19368d";

const LIMIT = 10;
const MAX_REQUESTS = 1000;
const DELAY_MS = 2100; // 2.1 segundos para respeitar rate limit

const backupFile = "cities_backup.json";
const progressFile = "progress.json";

// Sleep seguro (rate limit)
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Carregar progresso
let progress = {
  offset: 0,
  requests: 0,
  data: []
};

if (fs.existsSync(progressFile)) {
  progress = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
  console.log(`🔄 Retomando do offset ${progress.offset}`);
}

// Fetch paginado
async function fetchCities(offset) {
  const url = `${API_URL}?limit=${LIMIT}&offset=${offset}&types=CITY&hateoasMode=false`;
  const res = await fetch(url, {
   headers: {
       "X-RapidAPI-Key": API_KEY,
       "X-RapidAPI-Host": "wft-geo-db.p.rapidapi.com",
       "Accept": "application/json"
    }
   });


  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

async function run() {
  while (progress.requests < MAX_REQUESTS) {
    try {
      console.log(`📡 Req ${progress.requests + 1}/1000 | Offset ${progress.offset}`);

      const json = await fetchCities(progress.offset);

      if (!json.data || json.data.length === 0) {
        console.log("⚠️ Nenhuma cidade retornada. Encerrando.");
        break;
      }

      progress.data.push(...json.data);
      progress.offset += LIMIT;
      progress.requests++;

      // Persistência imediata (à prova de crash)
      fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
      fs.writeFileSync(backupFile, JSON.stringify(progress.data, null, 2));

      console.log(`✅ Total coletado: ${progress.data.length}`);

      await sleep(DELAY_MS);

    } catch (err) {
      console.error("❌ Erro:", err.message);
      console.log("⏸ Progresso salvo. Pode retomar depois.");
      break;
    }
  }

  console.log("🏁 Finalizado.");
}

run();

// =======================
// CONFIGURAÇÃO GLOBAL
// =======================

const DATA_SOURCE = "LOCAL";
const LOCAL_JSON_PATH = "cities_backup.json";

const TOTAL_CITIES_TARGET = 10000;
let NUM_WORKERS = navigator.hardwareConcurrency || 4;

// =======================
// ESTADO GLOBAL
// =======================

const initialState = {
  citiesFromApi: [],
  selectedCities: [],
  offset: 0,
  limit: 10,
  loading: false,
  error: null,

  fullDataset: [],
  loadingFullDataset: false
};

let state = initialState;

let shared = {
  size: 0,

  id: null,        // Int32Array
  lat: null,       // Float32Array
  lon: null,       // Float32Array
  pop: null,       // Float32Array
  assign: null     // Int32Array (cluster)
};

async function loadCitiesDataset() {
  return DATA_SOURCE === "LOCAL"
    ? loadCitiesFromLocalWorkers()
    : loadCitiesFromAPI();
}

let lastCentroids = null;


// =======================
// Shared State
// =======================

function buildSharedDataset(cities) {
  const n = cities.length;
  shared.size = n;

  // 4 bytes por elemento (Int32 / Float32)
  const idBuf = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * n);
  const latBuf = new SharedArrayBuffer(Float32Array.BYTES_PER_ELEMENT * n);
  const lonBuf = new SharedArrayBuffer(Float32Array.BYTES_PER_ELEMENT * n);
  const popBuf = new SharedArrayBuffer(Float32Array.BYTES_PER_ELEMENT * n);
  const assignBuf = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * n);

  shared.id = new Int32Array(idBuf);
  shared.lat = new Float32Array(latBuf);
  shared.lon = new Float32Array(lonBuf);
  shared.pop = new Float32Array(popBuf);
  shared.assign = new Int32Array(assignBuf);

  cities.forEach((c, i) => {
    shared.id[i] = c.id;
    shared.lat[i] = c.latitude;
    shared.lon[i] = c.longitude;
    shared.pop[i] = c.population ?? 0;
    shared.assign[i] = -1; // ainda sem cluster
  });

  console.log("🧠 SharedArrayBuffer criado:", {
    cities: n,
    buffers: Object.keys(shared)
  });
}

// =======================
// Dataset Service
// =======================

async function loadCitiesFromLocalWorkers() {
  const res = await fetch(LOCAL_JSON_PATH);
  const fullData = await res.json();

  const total = fullData.length;
  const chunkSize = Math.ceil(total / NUM_WORKERS);
  const allCities = [];
  let finished = 0;

  return new Promise((resolve, reject) => {
    for (let i = 0; i < NUM_WORKERS; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, total);
      const chunk = fullData.slice(start, end);

      const worker = new Worker("dataLocalWorker.js");

      worker.postMessage({ chunk });

      worker.onmessage = e => {
        allCities.push(...e.data.cities);
        finished++;
        worker.terminate();
        if (finished === NUM_WORKERS) resolve(allCities);
      };

      worker.onerror = reject;
    }
  });
}

// =======================
// K-means Core
// =======================

function buildSharedCentroids(initial, k) {
  const lat = new Float32Array(new SharedArrayBuffer(4 * k));
  const lon = new Float32Array(new SharedArrayBuffer(4 * k));
  const pop = new Float32Array(new SharedArrayBuffer(4 * k));


  initial.slice(0, k).forEach((c, i) => {
    lat[i] = c.lat;
    lon[i] = c.lon;
    pop[i] = c.pop;
  });


  return { lat, lon, pop };
}

async function kmeansIterationShared(k, centroids) {
  const chunkSize = Math.ceil(shared.size / NUM_WORKERS);


  const partials = await Promise.all(
    Array.from({ length: NUM_WORKERS }, (_, w) =>
      new Promise(resolve => {
        const worker = new Worker("kmeansSharedWorker.js");
        const start = w * chunkSize;
        const end = Math.min(start + chunkSize, shared.size);


        worker.onmessage = e => {
          worker.terminate();
          resolve(e.data.sums);
        };


        worker.postMessage({
          start,
          end,
          k,
          lat: shared.lat,
          lon: shared.lon,
          pop: shared.pop,
          assign: shared.assign,
          centLat: centroids.lat,
          centLon: centroids.lon,
          centPop: centroids.pop
        });
      })
    )
  );


  const totals = Array.from({ length: k }, () => ({ lat: 0, lon: 0, pop: 0, count: 0 }));

  partials.forEach(workerSums => {
    workerSums.forEach((s, i) => {
      if (!s || s.count === 0) return;

      totals[i].lat += s.lat;
      totals[i].lon += s.lon;
      totals[i].pop += s.pop;
      totals[i].count += s.count;
    });
  });

  totals.forEach((t, i) => {
    if (t.count > 0) {
      centroids.lat[i] = t.lat / t.count;
      centroids.lon[i] = t.lon / t.count;
      centroids.pop[i] = t.pop / t.count;
    }
  });
}

async function testSharedKMeans() {
  const normalized = normalizeCities(state.fullDataset);

  // sobrescreve SAB com dados normalizados
  normalized.forEach((c, i) => {
    shared.lat[i] = c.lat;
    shared.lon[i] = c.lon;
    shared.pop[i] = c.pop;
  });

  const k = 3;
  const centroids = buildSharedCentroids(normalized.slice(0, k), k);

  await kmeansIterationShared(k, centroids);

  console.log("🟢 Assign exemplo:", shared.assign.slice(0, 20));
  console.log("🟢 Centroides:", {
    lat: [...centroids.lat],
    lon: [...centroids.lon],
    pop: [...centroids.pop]
  });
}

async function ensureDatasetReady() {
  // já está pronta
  if (shared.size >= TOTAL_CITIES_TARGET) {
    console.log("✅ Base já pronta:", shared.size);
    return;
  }

  console.log("📥 Preparando base completa...");

  // 1️⃣ carrega JSON local
  const res = await fetch(LOCAL_JSON_PATH);
  const localCities = await res.json();

  let cities = [...localCities];
  let offset = cities.length;

  // 2️⃣ completa via API até 10K
  while (cities.length < TOTAL_CITIES_TARGET) {
    const data = await fetchCities(offset, 10);

    if (!Array.isArray(data)) {
      throw new Error("Erro ao buscar cidades da API");
    }

    cities.push(...data);
    offset += data.length;

    await new Promise(r => setTimeout(r, 2100));

    console.log(`📦 ${cities.length}/${TOTAL_CITIES_TARGET}`);
  }

  // 3️⃣ atualiza estado + SharedArrayBuffer
  state = setFullDataset(state, cities);
  buildSharedDataset(cities);

  // 4️⃣ feedback visual
  const status = document.getElementById("dataset-status");
  if (status) {
    status.textContent = `Base pronta (${shared.size} cidades)`;
  }

  console.log("🧠 Base final pronta:", shared.size);
}



const centroidShift = (prev, curr) =>
  prev.lat.reduce((max, _, i) => {
    const d =
      (curr.lat[i] - prev.lat[i]) ** 2 +
      (curr.lon[i] - prev.lon[i]) ** 2 +
      (curr.pop[i] - prev.pop[i]) ** 2;
    return Math.max(max, Math.sqrt(d));
  }, 0
);

function snapshotCentroids(centroids) {
  return {
    lat: Float32Array.from(centroids.lat),
    lon: Float32Array.from(centroids.lon),
    pop: Float32Array.from(centroids.pop)
  };
}

async function runKMeansShared(k, {
  maxIter = 20,
  epsilon = 1e-4,
  log = true
} = {}) {

  if (!shared || !shared.size) {
    throw new Error("Shared dataset não inicializado");
  }

  // 🔹 normaliza novamente e grava no SAB (seguro)
  const normalized = normalizeCities(state.fullDataset);
  normalized.forEach((c, i) => {
    shared.lat[i] = c.lat;
    shared.lon[i] = c.lon;
    shared.pop[i] = c.pop;
  });

  // 🔹 inicialização
  let centroids = buildSharedCentroids(normalized.slice(0, k), k);

  let iter = 0;
  let shift = Infinity;

  if (log) console.log(`▶️ K-means iniciado | k=${k}`);

  while (iter < maxIter && shift > epsilon) {
    const prev = snapshotCentroids(centroids);

    // 🔁 UMA iteração paralela (ETAPA 2)
    await kmeansIterationShared(k, centroids);

    // 📏 convergência
    shift = centroidShift(prev, centroids, k);

    if (log) {
      console.log(
        `🔄 Iter ${iter + 1} | deslocamento máx = ${shift.toExponential(3)}`
      );
    }

    iter++;
  }

  if (log) {
    console.log(
      `✅ K-means finalizado em ${iter} iterações | shift=${shift}`
    );
  }

  return { centroids, iterations: iter, shift };
}

function buildClustersFromAssign() {
  const clusters = new Map();

  for (let i = 0; i < shared.size; i++) {
    const c = shared.assign[i];
    if (!clusters.has(c)) clusters.set(c, []);
    clusters.get(c).push(state.fullDataset[i]);
  }

  return clusters; // Map<clusterId, City[]>
}

// =======================
// FUNÇÕES PURAS (REDUCERS)
// =======================

const clearSelectedCities = state => ({
  ...state,
  selectedCities: []
});

const startFullLoad = state => ({
  ...state,
  loadingFullDataset: true
});

const setFullDataset = (state, cities) => ({
  ...state,
  fullDataset: cities,
  loadingFullDataset: false
});

const startLoading = state => ({
  ...state,
  loading: true,
  error: null
});

const setCitiesFromApi = (state, cities) => ({
  ...state,
  citiesFromApi: cities,
  loading: false
});

const setError = (state, error) => ({
  ...state,
  loading: false,
  error
});

const addSelectedCity = (state, city) =>
  state.selectedCities.some(c => c.id === city.id)
    ? state
    : { ...state, selectedCities: [...state.selectedCities, city] };

const removeSelectedCity = (state, cityId) => ({
  ...state,
  selectedCities: state.selectedCities.filter(city => city.id !== cityId)
});

// =======================
// EFEITO COLATERAL (API)
// =======================

const fetchCities = async (offset, limit) => {
  try {
    const res = await fetch(
      `https://wft-geo-db.p.rapidapi.com/v1/geo/cities?limit=${limit}&offset=${offset}`,
      {
        headers: {
          "X-RapidAPI-Key": "5a3eaa3d97msh3e909ad35ec33b7p1bfa29jsn98b253aa1fa0",
          "X-RapidAPI-Host": "wft-geo-db.p.rapidapi.com"
        }
      }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    return json.data;
  } catch (err) {
    return { error: err.message };
  }
};

// =======================
// RENDERIZAÇÃO (PROJEÇÃO)
// =======================

const renderStatus = () => {
  document.getElementById("loading").textContent =
    state.loading ? "Carregando cidades..." : "";

  document.getElementById("error").textContent =
    state.error ? "Erro ao carregar dados da API." : "";
};

const renderCities = () => {
  const list = document.getElementById("cities-list");
  list.innerHTML = "";

  state.citiesFromApi.forEach(city => {
    const li = document.createElement("li");

    // 🔹 Info da cidade
    const info = document.createElement("div");
    info.className = "city-info";

    const title = document.createElement("strong");
    title.textContent = city.name;

    const meta = document.createElement("span");
    meta.textContent = `${city.country} · 👥 ${formatPopulation(city.population)}`;

    info.appendChild(title);
    info.appendChild(meta);

    // 🔹 Botão
    const btn = document.createElement("button");
    btn.textContent = "Selecionar";

    const alreadySelected = state.selectedCities.some(
      selected => selected.id === city.id
    );

    btn.disabled = alreadySelected;

    const selectCity = (state, city) =>
      addSelectedCity(state, city);

    btn.onclick = () => {
      state = selectCity(state, city);
      render();
    };


    // 🔹 Montagem final
    li.appendChild(info);
    li.appendChild(btn);
    list.appendChild(li);
  });
};

const renderSelected = () => {
  const list = document.getElementById("selected-list");
  list.innerHTML = "";

  // 👉 ESTADO VAZIO (modificação 2)
  if (state.selectedCities.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-selected";

    empty.innerHTML = `
      <div class="empty-icon">⭐</div>
      <p>Selecione cidades da lista para adicionar aqui</p>
    `;

    list.appendChild(empty);
    return;
  }

  state.selectedCities.forEach(city => {
    const li = document.createElement("li");

    const info = document.createElement("div");
    info.className = "city-info";

    const title = document.createElement("strong");
    title.textContent = city.name;

    const meta = document.createElement("span");
    meta.textContent = `${city.country} · 👥 ${formatPopulation(city.population)}`;

    info.appendChild(title);
    info.appendChild(meta);

    const btn = document.createElement("button");
    btn.textContent = "Remover";

    btn.onclick = () => {
      state = removeSelectedCity(state, city.id);
      render();
    };

    li.appendChild(info);
    li.appendChild(btn);
    list.appendChild(li);
  });
};


const renderSelectedCount = () => {
  document.getElementById("selected-count").textContent =
    state.selectedCities.length;
};

const render = () => {
  renderStatus();
  renderCities();
  renderSelected();
  renderSelectedCount();

  const page = state.offset / state.limit + 1;
  const indicator = document.getElementById("page-indicator");
  if (indicator) {
    indicator.textContent = `Página ${page}`;
  }

  document.getElementById("clear-selected").disabled =
    state.selectedCities.length === 0;
  document.getElementById("next").disabled = state.loading;
  document.getElementById("prev").disabled =
    state.loading || state.offset === 0;
};

// =======================
// CONTROLE DE FLUXO
// =======================

const loadCities = async () => {
  state = startLoading(state);
  render();

  const result = await fetchCities(state.offset, state.limit);

  state = result.error
    ? setError(state, result.error)
    : setCitiesFromApi(state, result);

  render();
};

const loadCitiesWithOffset = async (newOffset) => {
  state = startLoading(state);
  render();

  const result = await fetchCities(newOffset, state.limit);

  if (result?.error) {
    state = setError(state, result.error);
    render();
    return; // ❌ offset NÃO muda
  }

  state = {
    ...state,
    citiesFromApi: result,
    offset: newOffset,
    loading: false,
    error: null
  };

  render();
};

// =======================
// MODAL: LIMPAR SELECIONADAS
// =======================

const clearModal = document.getElementById("clear-modal");
const openClearBtn = document.getElementById("clear-selected");
const closeClearBtn = document.getElementById("close-clear-modal");
const cancelClearBtn = document.getElementById("cancel-clear");
const confirmClearBtn = document.getElementById("confirm-clear");

const modal = document.getElementById("cluster-modal");
const modalTitle = document.getElementById("modal-title");
const modalCityList = document.getElementById("modal-city-list");
const closeModalBtn = document.getElementById("close-modal");

// =======================
// EVENTOS
// =======================

openClearBtn.onclick = () => {
  if (state.selectedCities.length === 0) return;
  clearModal.classList.remove("hidden");
};

const closeClearModal = () => {
  clearModal.classList.add("hidden");
};

closeClearBtn.onclick = closeClearModal;
cancelClearBtn.onclick = closeClearModal;

clearModal.querySelector(".modal-overlay").onclick = closeClearModal;

confirmClearBtn.onclick = () => {
  state = clearSelectedCities(state);
  render();
  closeClearModal();
};

document.getElementById("next").onclick = () => {
  setTimeout(() => {
    loadCitiesWithOffset(state.offset + state.limit);
  }, 300);
};

document.getElementById("prev").onclick = () => {
  setTimeout(() => {
    loadCitiesWithOffset(Math.max(0, state.offset - state.limit));
  }, 300);
};

const list = document.querySelector('.city-list');
const fade = document.querySelector('.scroll-fade');

list.addEventListener('scroll', () => {
  const atBottom =
    list.scrollTop + list.clientHeight >= list.scrollHeight - 1;

  fade.style.opacity = atBottom ? '0' : '1';
});

document.getElementById("load-all").onclick = async () => {
  const btn = document.getElementById("load-all");
  const originalText = btn.textContent;

  btn.disabled = true;
  btn.textContent = "Preparando base...";

  try {
    await ensureDatasetReady();
    btn.textContent = "Base pronta ✓";
  } catch (err) {
    console.error(err);
    alert("Erro ao preparar base");
    btn.textContent = originalText;
  } finally {
    btn.disabled = false;
  }
};

function updateLoadAllButton() {
  const btn = document.getElementById("load-all");
  if (!btn) return;

  if (shared.size >= TOTAL_CITIES_TARGET) {
    btn.disabled = true;
    btn.textContent = "Base completa ✓";
  } else {
    btn.disabled = false;
    btn.textContent = "Carregar base completa";
  }
}

document.getElementById("run-kmeans").onclick = async () => {
  const btn = document.getElementById("run-kmeans");
  const originalText = btn.textContent;

  const k = parseInt(document.getElementById("k-input").value, 10);
  if (isNaN(k) || k < 2) {
    alert("K deve ser >= 2");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Preparando base...";

  try {
    await ensureDatasetReady();

    btn.textContent = "Executando K-means...";

    NUM_WORKERS = Math.min(
      k,
      navigator.hardwareConcurrency || k
    );

    const result = await runKMeansShared(k, {
      maxIter: 25,
      epsilon: 1e-4
    });

    lastCentroids = result.centroids;

    showClustersUI();

  } catch (err) {
    console.error(err);
    alert("Erro ao executar o K-means");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
};


function openClusterModal(clusterId, cities) {
  modalTitle.textContent = `Cluster ${clusterId} (${cities.length} cidades)`;
  modalCityList.innerHTML = "";

  cities.forEach(city => {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = city.name;

    const meta = document.createElement("span");
    meta.textContent = `${city.country} · 👥 ${formatPopulation(city.population)}`;

    li.appendChild(title);
    li.appendChild(meta);
    modalCityList.appendChild(li);
  });

  modal.classList.remove("hidden");
}

closeModalBtn.addEventListener("click", () => {
  modal.classList.add("hidden");
});

modal.querySelector(".modal-overlay").addEventListener("click", () => {
  modal.classList.add("hidden");
});

// =======================

const normalizeCities = cities => {
  const lats = cities.map(c => c.latitude);
  const lons = cities.map(c => c.longitude);
  const pops = cities.map(c => c.population || 0);

  const minMax = arr => [Math.min(...arr), Math.max(...arr)];

  const [latMin, latMax] = minMax(lats);
  const [lonMin, lonMax] = minMax(lons);
  const [popMin, popMax] = minMax(pops);

  return cities.map(c => ({
    id: c.id,
    lat: (c.latitude - latMin) / (latMax - latMin),
    lon: (c.longitude - lonMin) / (lonMax - lonMin),
    pop: (c.population - popMin) / (popMax - popMin)
  }));
};

const initCentroids = (data, k) => data.slice(0, k).map(c => ({
  lat: c.lat,
  lon: c.lon,
  pop: c.pop
}));

const kmeansIteration = async (cities, centroids) => {
  const workers = centroids.map(
    () => new Worker("kmeansWorker.js")
  );

  const promises = workers.map((worker, i) =>
    new Promise(resolve => {
      worker.onmessage = e => resolve(e.data);
      worker.postMessage({
        cities,
        centroid: centroids[i],
        clusterIndex: i
      });
    })
  );

  const distanceResults = await Promise.all(promises);

  workers.forEach(w => w.terminate());

  // associação correta (main thread decide)
  const clusters = Array.from({ length: centroids.length }, () => []);

  cities.forEach(city => {
    let bestCluster = 0;
    let min = Infinity;

    distanceResults.forEach(result => {
      const d = result.distances.find(x => x.cityId === city.id).distance;
      if (d < min) {
        min = d;
        bestCluster = result.clusterIndex;
      }
    });

    clusters[bestCluster].push(city);
  });

  return clusters;
};

const recomputeCentroids = clusters =>
  clusters.map(cluster => {
    const sum = cluster.reduce(
      (acc, c) => ({
        lat: acc.lat + c.lat,
        lon: acc.lon + c.lon,
        pop: acc.pop + c.pop
      }),
      { lat: 0, lon: 0, pop: 0 }
    );

    return {
      lat: sum.lat / cluster.length,
      lon: sum.lon / cluster.length,
      pop: sum.pop / cluster.length
    };
  });


const testSingleKMeansIteration = async (K) => {
  if (state.fullDataset.length === 0) {
    console.warn("Base completa ainda não foi carregada");
    return;
  }

  console.log("🔹 Total de cidades:", state.fullDataset.length);

  // 1️⃣ Normaliza
  const normalized = normalizeCities(state.fullDataset);
  console.log("🔹 Dados normalizados (exemplo):", normalized.slice(0, 5));

  // 2️⃣ Inicializa centroides
  const centroids = initCentroids(normalized, K);
  console.log("🔹 Centroides iniciais:", centroids);

  // 3️⃣ UMA iteração (workers)
  const clusters = await kmeansIteration(normalized, centroids);

  console.log("🔹 Resultado da iteração:");
  clusters.forEach((cluster, i) => {
    console.log(`Cluster ${i}: ${cluster.length} cidades`);
  });

  // 4️⃣ Recalcula centroides
  const newCentroids = recomputeCentroids(clusters);
  console.log("🔹 Novos centroides:", newCentroids);
};

const loadFullDatasetParallel = async () => {
  console.log("🚀 Carregando base completa (LOCAL)");

  const cities = await loadCitiesDataset(); // JSON local + workers
  state = setFullDataset(state, cities);

  buildSharedDataset(cities); // 🔥 ETAPA 1 AQUI

  console.log("✅ Shared dataset pronto:", shared.size);

  // por enquanto NÃO rodamos k-means
  await testSharedKMeans();


  const result = await runKMeansShared(3, {
    maxIter: 25,
    epsilon: 1e-4
  });

  const clusters = buildClustersFromAssign();
  console.log("Clusters finais:", clusters);

  showClustersUI();

  let sum = 0;

  clusters.forEach((cities, cid) => {
    sum += cities.length;
  });

  console.log("🔢 Soma dos clusters:", sum);
  console.log("📦 shared.size:", shared.size);
  console.log("📂 fullDataset:", state.fullDataset.length);

};

function renderClustersSummary(clusters) {

  if (!lastCentroids) {
    console.warn("Centroides ainda não calculados");
    return;
  }

  const container = document.getElementById("clusters-summary");
  container.innerHTML = "";

  clusters.forEach((cities, cid) => {
    const box = document.createElement("div");
    box.className = "cluster-box";

    const title = document.createElement("strong");
    title.textContent = `Cluster ${cid}`;

    const count = document.createElement("span");
    count.textContent = `${cities.length} cidades`;

    // 🔥 CENTROIDE
    const centroidRaw = {
      lat: lastCentroids.lat[cid],
      lon: lastCentroids.lon[cid],
      pop: lastCentroids.pop[cid]
    };

    const centroid = denormalizeCentroid(centroidRaw);

    const centroidInfo = document.createElement("div");
    centroidInfo.className = "centroid-info";
    centroidInfo.innerHTML = `
    📍 <strong>Centroide</strong><br>
    Lat: ${centroid.latitude.toFixed(2)}<br>
    Lon: ${centroid.longitude.toFixed(2)}<br>
    👥 ${formatPopulation(centroid.population)}
  `;

    const btn = document.createElement("button");
    btn.textContent = "Ver cidades";
    btn.onclick = () => openClusterModal(cid, cities);

    box.appendChild(title);
    box.appendChild(count);
    box.appendChild(centroidInfo);
    box.appendChild(btn);

    container.appendChild(box);
  });
}

function showClustersUI() {
  const clusters = buildClustersFromAssign();

  document.getElementById("clusters-card").style.display = "flex";

  renderClustersSummary(clusters);
}


const formatPopulation = (pop) => {
  if (!pop) return "População desconhecida";
  if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(1)}M`;
  if (pop >= 1_000) return `${(pop / 1_000).toFixed(1)}k`;
  return pop.toString();
};

async function ensureFullDatasetLoaded() {
  // já carregado
  if (shared && shared.size >= TOTAL_CITIES_TARGET) {
    return;
  }

  console.log("📥 Base não carregada. Carregando automaticamente...");

  // carrega do JSON local (já existe)
  const cities = await loadCitiesDataset();

  state = setFullDataset(state, cities);
  buildSharedDataset(cities);
  updateLoadAllButton();

  console.log("✅ Base carregada automaticamente:", shared.size);
}

function denormalizeCentroid(c) {
  const lats = state.fullDataset.map(x => x.latitude);
  const lons = state.fullDataset.map(x => x.longitude);
  const pops = state.fullDataset.map(x => x.population || 0);

  const minMax = arr => [Math.min(...arr), Math.max(...arr)];

  const [latMin, latMax] = minMax(lats);
  const [lonMin, lonMax] = minMax(lons);
  const [popMin, popMax] = minMax(pops);

  return {
    latitude: c.lat * (latMax - latMin) + latMin,
    longitude: c.lon * (lonMax - lonMin) + lonMin,
    population: Math.round(c.pop * (popMax - popMin) + popMin)
  };
}

// =======================
// INICIALIZAÇÃO
// =======================

loadCities();
updateLoadAllButton();
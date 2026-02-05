// =======================
// ESTADO INICIAL
// =======================

const initialState = {
  citiesFromApi: [],
  selectedCities: [],
  offset: 0,
  limit: 10,
  loading: false
};

let state = initialState;

// =======================
// FUNÇÕES PURAS (FUNCIONAL)
// =======================

const setCitiesFromApi = (state, cities) => ({
  ...state,
  citiesFromApi: cities,
  loading: false
});

const startLoading = state => ({
  ...state,
  loading: true
});

const addSelectedCity = (state, city) => {
  const exists = state.selectedCities.some(c => c.id === city.id);
  if (exists) return state;

  return {
    ...state,
    selectedCities: [...state.selectedCities, city]
  };
};

const nextPage = state => ({
  ...state,
  offset: state.offset + state.limit
});

const prevPage = state => ({
  ...state,
  offset: Math.max(0, state.offset - state.limit)
});

// =======================
// EFEITO COLATERAL (API)
// =======================

const fetchCities = async (offset, limit) => {
  const res = await fetch(
    `https://wft-geo-db.p.rapidapi.com/v1/geo/cities?limit=${limit}&offset=${offset}`,
    {
      headers: {
        "X-RapidAPI-Key": "5a3eaa3d97msh3e909ad35ec33b7p1bfa29jsn98b253aa1fa0   ",
        "X-RapidAPI-Host": "wft-geo-db.p.rapidapi.com"
      }
    }
  );

  const json = await res.json();
  return json.data;
};

// =======================
// RENDERIZAÇÃO
// =======================

const renderCities = () => {
  const list = document.getElementById("cities-list");
  const loadingText = document.getElementById("loading");

  list.innerHTML = "";
  loadingText.textContent = state.loading ? "Carregando cidades..." : "";

  state.citiesFromApi.forEach(city => {
    const li = document.createElement("li");
    li.textContent = city.name;

    const btn = document.createElement("button");
    btn.textContent = "Selecionar";
    btn.disabled = state.selectedCities.some(c => c.id === city.id);

    btn.onclick = () => {
      state = addSelectedCity(state, city);
      renderSelected();
      renderCities();
    };

    li.appendChild(btn);
    list.appendChild(li);
  });
};

const renderSelected = () => {
  const list = document.getElementById("selected-list");
  list.innerHTML = "";

  state.selectedCities.forEach(city => {
    const li = document.createElement("li");
    li.textContent = city.name;
    list.appendChild(li);
  });
};

// =======================
// CONTROLE DE FLUXO
// =======================

const loadCities = async () => {
  state = startLoading(state);
  renderCities();

  const cities = await fetchCities(state.offset, state.limit);
  state = setCitiesFromApi(state, cities);

  renderCities();
};

// =======================
// EVENTOS
// =======================

document.getElementById("next").onclick = async () => {
  state = nextPage(state);
  await loadCities();
};

document.getElementById("prev").onclick = async () => {
  state = prevPage(state);
  await loadCities();
};

// =======================
// INICIALIZAÇÃO
// =======================

loadCities();

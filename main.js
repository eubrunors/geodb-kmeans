// =======================
// ESTADO INICIAL
// =======================

const initialState = {
  citiesFromApi: [],
  selectedCities: [],
  offset: 0,
  limit: 10,
  loading: false,
  error: null
};

let state = initialState;

// =======================
// FUNÇÕES PURAS (REDUCERS)
// =======================

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

    const span = document.createElement("span");
    span.textContent = `${city.name} — ${city.country}`;

    const btn = document.createElement("button");
    btn.textContent = "Selecionar";

    const alreadySelected = state.selectedCities.some(
      selected => selected.id === city.id
    );

    btn.disabled = alreadySelected;

    btn.onclick = () => {
      state = addSelectedCity(state, city);
      render();
    };

    li.appendChild(span);
    li.appendChild(btn);
    list.appendChild(li);
  });
};

const renderSelected = () => {
  const list = document.getElementById("selected-list");
  list.innerHTML = "";

  state.selectedCities.forEach(city => {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.textContent = city.name;

    const btn = document.createElement("button");
    btn.textContent = "Remover";

    btn.onclick = () => {
      state = removeSelectedCity(state, city.id);
      render();
    };

    li.appendChild(span);
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
// EVENTOS
// =======================

document.getElementById("next").onclick = () => {
  loadCitiesWithOffset(state.offset + state.limit);
};

document.getElementById("prev").onclick = () => {
  loadCitiesWithOffset(Math.max(0, state.offset - state.limit));
};

const list = document.querySelector('.city-list');
const fade = document.querySelector('.scroll-fade');

list.addEventListener('scroll', () => {
  const atBottom =
    list.scrollTop + list.clientHeight >= list.scrollHeight - 1;

  fade.style.opacity = atBottom ? '0' : '1';
});


// =======================
// INICIALIZAÇÃO
// =======================

loadCities();

self.onmessage = (e) => {
  const { chunk } = e.data;
  const processed = chunk
    .filter(c => c.latitude && c.longitude && c.population)
    .map(c => ({
      id: c.id,
      name: c.name,
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
      population: Number(c.population),
      country: c.country
    }));

  self.postMessage({ cities: processed });
};

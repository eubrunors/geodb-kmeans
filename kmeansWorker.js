// Cada worker é responsável por UM cluster (UM centróide)

function distance(a, b) {
  return Math.sqrt(
    (a.lat - b.lat) ** 2 +
    (a.lon - b.lon) ** 2 +
    (a.pop - b.pop) ** 2
  );
}

self.onmessage = e => {
  const { cities, centroid, clusterIndex } = e.data;

  // calcula distância de TODAS as cidades para ESTE centróide
  const distances = cities.map(city => ({
    cityId: city.id,
    distance: distance(city, centroid)
  }));

  self.postMessage({
    clusterIndex,
    distances
  });
};

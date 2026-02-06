self.onmessage = (e) => {
  const {
    start,
    end,
    k,
    lat,
    lon,
    pop,
    centLat,
    centLon,
    centPop,
    assign
  } = e.data;

  const sums = Array.from({ length: k }, () => ({
    lat: 0,
    lon: 0,
    pop: 0,
    count: 0
  }));

  for (let i = start; i < end; i++) {
    let best = 0;
    let minDist = Infinity;

    for (let c = 0; c < k; c++) {
      const dLat = lat[i] - centLat[c];
      const dLon = lon[i] - centLon[c];
      const dPop = pop[i] - centPop[c];

      const dist = dLat * dLat + dLon * dLon + dPop * dPop;

      if (dist < minDist) {
        minDist = dist;
        best = c;
      }
    }

    assign[i] = best;

    sums[best].lat += lat[i];
    sums[best].lon += lon[i];
    sums[best].pop += pop[i];
    sums[best].count++;
  }

  self.postMessage({ sums });
};

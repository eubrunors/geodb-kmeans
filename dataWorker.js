self.onmessage = async (e) => {
  const { startOffset, limit, pages, apiKey } = e.data;
  const results = [];

  for (let i = 0; i < pages; i++) {
    const offset = startOffset + i * limit;

    const res = await fetch(
      `https://wft-geo-db.p.rapidapi.com/v1/geo/cities?limit=${limit}&offset=${offset}`,
      {
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": "wft-geo-db.p.rapidapi.com"
        }
      }
    );

    const json = await res.json();
    results.push(...json.data);

    // ⚠️ respeito ao rate limit
    await new Promise(r => setTimeout(r, 300));
  }

  self.postMessage(results);
};

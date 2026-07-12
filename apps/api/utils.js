function getConfig(argv = process.argv.slice(2)) {
  // Default to port 3000 if no port flag is provided or if the provided value is invalid
  const defaultPort = 3000;
  const portFlagIndex = argv.findIndex(
    (arg) => arg === "-p" || arg === "--port",
  );
  const portValue = portFlagIndex >= 0 ? argv[portFlagIndex + 1] : null;

  // Check mode, production mode is the default
  const mode = argv.includes("--dev") ? "development" : "production";
  const isDev = mode === "development";
  const isProd = mode === "production";

  return {
    port:
      Number.parseInt(portValue, 10) ||
      Number.parseInt(process.env.PORT, 10) ||
      defaultPort,
    mode,
    isDev,
    isProd,
    width: isDev ? 1920 : undefined,
    height: isDev ? 440 : undefined,
  };
}

// Fallback location used only when ip-api geolocation fails. Override via env.
const defaultLocation = {
  city: process.env.DEFAULT_CITY || "Kuala Lumpur",
  country: process.env.DEFAULT_COUNTRY || "Malaysia",
  countryCode: process.env.DEFAULT_COUNTRY_CODE || "MY",
  lat: Number.parseFloat(process.env.DEFAULT_LAT) || 3.139,
  lon: Number.parseFloat(process.env.DEFAULT_LON) || 101.6869,
};

let locationPromise = null;

function getLocation() {
  if (!locationPromise) {
    locationPromise = fetch(
      "http://ip-api.com/json/?fields=status,message,country,countryCode,city,lat,lon",
      // Geolocation blocks the weather/solat endpoints, so fail fast and fall
      // back to the default location rather than stalling those requests.
      { signal: AbortSignal.timeout(5000) },
    )
      .then((response) => response.json())
      .then((data) => {
        if (data.status !== "success") {
          throw new Error(data.message || "Unable to resolve current location");
        }

        return {
          city: data.city || defaultLocation.city,
          country: data.country || defaultLocation.country,
          countryCode: data.countryCode || "MY",
          lat: data.lat || defaultLocation.lat,
          lon: data.lon || defaultLocation.lon,
        };
      })
      .catch((err) => {
        // Geolocation is best-effort: log why it failed, then fall back to the
        // default location. Reset the promise so the next request retries.
        console.warn(
          `${new Date().toISOString()} [upstream:ip-api] geolocation failed, using default (${defaultLocation.city}) — ${err.message}`,
        );
        locationPromise = null;
        return defaultLocation;
      });
  }

  return locationPromise;
}

module.exports = { getConfig, getLocation };

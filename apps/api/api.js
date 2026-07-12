const path = require("path");
// Load a local, git-ignored apps/api/.env for development (secrets like
// UNSPLASH_ACCESS_KEY, or a custom REDIS_URL/PORT). Best-effort: in production the
// file isn't shipped, so this no-ops and real env vars (compose) are used instead.
try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch {
  // No .env file — fine, fall back to the process environment.
}

const promisify = require("util").promisify;
const Fastify = require("fastify");
const cors = require("@fastify/cors");
const redis = require("redis");
const dayjs = require("dayjs");
const isBetween = require("dayjs/plugin/isBetween");
const isSameOrAfter = require("dayjs/plugin/isSameOrAfter");
dayjs.extend(isBetween);
dayjs.extend(isSameOrAfter);
const { getConfig, getLocation } = require("./utils");

const config = getConfig();
const aladhanMethod = 3;

// How long an upstream call may take before we abort it (fetch AbortSignal). A
// stalled upstream then fails fast as a timeout instead of tying up the request.
const REQUEST_TIMEOUT_MS = 8000;

const cacheClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});
// A cache blip must not crash the API: without a listener, node_redis throws the
// 'error' event and takes the process down. Log it and let the client reconnect.
cacheClient.on("error", (err) => console.error("Redis error:", err.message));

const cache = {
  get: promisify(cacheClient.get).bind(cacheClient),
  set: promisify(cacheClient.set).bind(cacheClient),
};

function buildSolatUrl(location, month, year) {
  return `http://api.aladhan.com/v1/calendarByCity?city=${encodeURIComponent(location.city)}&country=${encodeURIComponent(location.country)}&method=${aladhanMethod}&month=${month}&year=${year}`;
}

function buildOpenMeteoUrl(location, params) {
  const query = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    timezone: "auto",
    ...params,
  });

  return `https://api.open-meteo.com/v1/forecast?${query.toString()}`;
}

// Code	Description
// 0	Clear sky
// 1, 2, 3	Mainly clear, partly cloudy, and overcast
// 45, 48	Fog and depositing rime fog
// 51, 53, 55	Drizzle: Light, moderate, and dense intensity
// 56, 57	Freezing Drizzle: Light and dense intensity
// 61, 63, 65	Rain: Slight, moderate and heavy intensity
// 66, 67	Freezing Rain: Light and heavy intensity
// 71, 73, 75	Snow fall: Slight, moderate, and heavy intensity
// 77	Snow grains
// 80, 81, 82	Rain showers: Slight, moderate, and violent
// 85, 86	Snow showers slight and heavy
// 95 *	Thunderstorm: Slight or moderate
// 96, 99 *	Thunderstorm with slight and heavy hail
function mapWeatherCodeToPhrase(code, isDay) {
  const phrases = {
    0: isDay ? "Sunny" : "Clear",
    1: isDay ? "Mostly sunny" : "Mostly clear",
    2: "Partly cloudy",
    3: "Cloudy",
    45: "Cloudy",
    48: "Cloudy",
    51: "Rain",
    53: "Rain",
    55: "Rain",
    56: "Rain",
    57: "Rain",
    61: "Rain",
    63: "Rain",
    65: "Rain",
    66: "Rain",
    67: "Rain",
    71: "Rain",
    73: "Rain",
    75: "Rain",
    77: "Rain",
    80: "Rain",
    81: "Rain",
    82: "Rain",
    85: "Rain",
    86: "Rain",
    95: "Rain",
    96: "Rain",
    99: "Rain",
  };

  return phrases[code] || "Cloudy";
}

function mapOpenMeteoCurrent(current, isDaylight) {
  return {
    main: {
      temp: current.temperature_2m,
      feels_like: current.apparent_temperature,
    },
    isDay: isDaylight,
    iconPhrase: mapWeatherCodeToPhrase(current.weather_code, isDaylight),
  };
}

function mapOpenMeteoForecast(hourly) {
  const startTime = dayjs().add(1, "hour").startOf("hour");
  const times = hourly.time || [];
  const temperatures = hourly.temperature_2m || [];
  const feelsLike = hourly.apparent_temperature || temperatures;
  const weatherCodes = hourly.weather_code || [];
  const daylightFlags = hourly.is_day || [];

  return times
    .map((time, index) => {
      const isDaylight = Boolean(daylightFlags[index]);

      return {
        DateTime: time,
        Temperature: {
          Value: temperatures[index],
        },
        RealFeelTemperature: {
          Value: feelsLike[index],
        },
        IsDaylight: isDaylight,
        IconPhrase: mapWeatherCodeToPhrase(weatherCodes[index], isDaylight),
        Icon: weatherCodes[index] || 0,
      };
    })
    .filter((item) => dayjs(item.DateTime).isSameOrAfter(startTime))
    .slice(0, 9);
}

// Build an Error carrying enough context for logUpstreamError: which upstream,
// the URL, the HTTP status (when the server answered) and a slice of the body.
// Native fetch wraps a network failure as `TypeError: fetch failed` with the real
// error (ENOTFOUND / ECONNREFUSED / …) on `.cause`; unwrap it so the log is useful.
function upstreamError(source, url, cause, status, body) {
  const root = cause && cause.cause ? cause.cause : cause;
  const err = new Error(root && root.message ? root.message : String(cause));
  err.source = source;
  err.url = url;
  err.status = status;
  err.body = body;
  err.name = (cause && cause.name) || err.name; // keep TimeoutError/AbortError
  err.code = root && root.code;
  return err;
}

// Report a failed upstream (external API) call with as much context as it carries:
// the upstream tag, the request URL, and either the HTTP status it answered with,
// a timeout, or the low-level failure name/code when the connection never landed.
function logUpstreamError(err) {
  let reason;
  if (err.status) reason = `HTTP ${err.status}`;
  else if (err.name === "TimeoutError" || err.name === "AbortError")
    reason = `timeout after ${REQUEST_TIMEOUT_MS}ms`;
  else reason = err.code || err.name || "request failed";

  const body = err.body ? ` body=${String(err.body).slice(0, 300)}` : "";
  console.error(
    `${new Date().toISOString()} [upstream:${err.source || "?"}] ${reason} — ${err.message}` +
      `${err.url ? ` url=${err.url}` : ""}${body}`,
  );
}

// Fetch JSON from an upstream, caching the parsed body in Redis until `until`.
// A cache hit makes no network call. Applies the request timeout and, on any
// failure (network, timeout, or non-2xx), throws an upstreamError.
async function cachedFetchJson(source, url, until) {
  const cached = await cache.get(url);
  if (cached) return JSON.parse(cached);

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    throw upstreamError(source, url, err);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw upstreamError(
      source,
      url,
      new Error(`HTTP ${res.status}`),
      res.status,
      body,
    );
  }

  const data = await res.json();
  const ttl = Math.max(1, until.diff(dayjs(), "seconds"));
  await cache.set(url, JSON.stringify(data), "EX", ttl);
  return data;
}

const fastify = Fastify({ logger: false });
fastify.register(cors);

// Access log: one line per request on completion — timestamp, client IP, method,
// path, status, and duration. Written to stdout so `docker logs` picks it up.
// x-forwarded-for is preferred so the real client shows through a proxy.
fastify.addHook("onResponse", (req, reply, done) => {
  const ip = req.headers["x-forwarded-for"] || req.ip;
  console.log(
    `${new Date().toISOString()} ${ip} ${req.method} ${req.url} ${reply.statusCode} ${reply.elapsedTime.toFixed(1)}ms`,
  );
  done();
});

fastify.get("/", async () => ({ message: "OK!" }));

fastify.get("/gambar", async (req, reply) => {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return reply
      .code(503)
      .send({ message: "Wallpaper source not configured (set UNSPLASH_ACCESS_KEY)" });
  }
  try {
    return await cachedFetchJson(
      "unsplash",
      `https://api.unsplash.com/photos/random?client_id=${accessKey}&query=japan&orientation=landscape`,
      dayjs().endOf("hour"),
    );
  } catch (err) {
    logUpstreamError(err);
    return reply.code(502).send({ message: "Failed to fetch wallpaper" });
  }
});

fastify.get("/cuaca/semasa", async (req, reply) => {
  try {
    const location = await getLocation();
    const data = await cachedFetchJson(
      "open-meteo/current",
      buildOpenMeteoUrl(location, {
        current: "temperature_2m,apparent_temperature,weather_code",
        daily: "sunrise,sunset",
        forecast_days: 1,
      }),
      dayjs().endOf("hour"),
    );

    const current = data.current || {};
    const daily = data.daily || {};
    const now = dayjs(current.time);
    const sunrise = dayjs(daily.sunrise[0]);
    const sunset = dayjs(daily.sunset[0]);
    const isDaylight = now.isBetween(sunrise, sunset);

    return mapOpenMeteoCurrent(current, isDaylight);
  } catch (err) {
    logUpstreamError(err);
    return reply.code(502).send({ message: "Failed to fetch current weather" });
  }
});

fastify.get("/cuaca/ramalan", async (req, reply) => {
  try {
    const location = await getLocation();
    const data = await cachedFetchJson(
      "open-meteo/forecast",
      buildOpenMeteoUrl(location, {
        hourly:
          "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
        forecast_days: "2",
      }),
      dayjs().endOf("hour"),
    );

    return mapOpenMeteoForecast(data.hourly || {});
  } catch (err) {
    logUpstreamError(err);
    return reply.code(502).send({ message: "Failed to fetch weather forecast" });
  }
});

fastify.get("/solat", async (req, reply) => {
  const now = dayjs();
  const prevMonth = dayjs().subtract(1, "month");
  const nextMonth = dayjs().add(1, "month");

  try {
    const location = await getLocation();
    const [prevMonthData, currentMonthData, nextMonthData] = await Promise.all([
      cachedFetchJson(
        "aladhan",
        buildSolatUrl(location, prevMonth.month() + 1, prevMonth.year()),
        now.clone().endOf("month"),
      ),
      cachedFetchJson(
        "aladhan",
        buildSolatUrl(location, now.month() + 1, now.year()),
        now.clone().endOf("month"),
      ),
      cachedFetchJson(
        "aladhan",
        buildSolatUrl(location, nextMonth.month() + 1, nextMonth.year()),
        now.clone().endOf("month"),
      ),
    ]);

    const prev = prevMonthData.data;
    const current = currentMonthData.data;
    const next = nextMonthData.data;

    return [
      prev[prev.length - 1], // Last day of previous month
      ...current,
      next[0], // First day of next month
    ];
  } catch (err) {
    logUpstreamError(err);
    return reply.code(502).send({ message: "Failed to fetch prayer times" });
  }
});

fastify
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => console.log(`Waktu API listening on port ${config.port}!`))
  .catch((err) => {
    console.error("Failed to start Waktu API:", err);
    process.exit(1);
  });

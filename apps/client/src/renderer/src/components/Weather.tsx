import { useState, useEffect } from "react";
import type { ReactElement } from "react";
import dayjs from "dayjs";
import { fetchJson } from "../config";

interface CurrentWeather {
  main: {
    temp: number;
    feels_like: number;
  };
  isDay: boolean;
  iconPhrase: string;
}

interface ForecastWeather {
  DateTime: string;
  Temperature: {
    Value: number;
  };
  IconPhrase: string;
  IsDaylight: boolean;
}

type IconCategory = "day" | "night" | "default";

const ICONS: Record<IconCategory, Record<string, React.ReactNode>> = {
  default: {
    Cloudy: <i className="fas fa-cloud" />,
    Rain: <i className="fas fa-cloud-rain" />,
  },
  day: {
    "Mostly cloudy": <i className="fas fa-cloud-sun" />,
    "Partly cloudy": <i className="fas fa-cloud-sun" />,
    "Mostly sunny": <i className="fas fa-cloud-sun" />,
    "Partly sunny": <i className="fas fa-cloud-sun" />,
    "Intermittent clouds": <i className="fas fa-cloud-sun" />,
    Sunny: <i className="fas fa-sun" />,
  },
  night: {
    "Mostly cloudy": <i className="fas fa-cloud-moon" />,
    "Partly cloudy": <i className="fas fa-cloud-moon" />,
    "Mostly clear": <i className="fas fa-cloud-moon" />,
    "Partly clear": <i className="fas fa-cloud-moon" />,
    "Intermittent clouds": <i className="fas fa-cloud-moon" />,
    Clear: <i className="fas fa-moon" />,
  },
};

function mapIconPhraseToIcon(phrase: string, isDay: boolean): React.ReactNode {
  const dayOrNight: IconCategory = isDay ? "day" : "night";
  return ICONS[dayOrNight][phrase] || ICONS.default[phrase];
}


export default function Weather(): ReactElement {
  const [currentTemp, setCurrentTemp] = useState<string>("");
  const [currentFeel, setCurrentFeel] = useState<string>("");
  const [currentIcon, setCurrentIcon] = useState<React.ReactNode>(null);
  const [forecast, setForecast] = useState<ForecastWeather[]>([]);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const [semasa, ramalan] = await Promise.all([
          fetchJson<CurrentWeather>("/cuaca/semasa"),
          fetchJson<ForecastWeather[]>("/cuaca/ramalan"),
        ]);

        setCurrentTemp(`${Math.round(semasa.main.temp)}°`);
        setCurrentFeel(`${Math.round(semasa.main.feels_like)}°`);
        setCurrentIcon(mapIconPhraseToIcon(semasa.iconPhrase, semasa.isDay));
        setForecast(ramalan);

        setTimeout(
          fetchWeather,
          dayjs().endOf("hour").add(1, "second").diff(dayjs()),
        );
      } catch {
        setTimeout(fetchWeather, 1000);
      }
    };
    fetchWeather();
  }, []);

  return (
    <div className="flex flex-1 justify-end">
      <div className="flex flex-col items-center gap-2 px-8 pt-6 text-shadow-lg/40 relative">
        <div className="flex flex-row items-end gap-4 relative z-1">
          <div className="text-9xl z-1 font-medium">{currentTemp}</div>
          <div className="text-9xl absolute top-0 left-0 opacity-30 transform -translate-x-1/4 -translate-y-[10px]">
            {currentIcon}
          </div>
          <div className="flex flex-col items-start text-5xl z-1 font-regular mb-4">
            <p className="text-3xl font-light">Feels</p>
            <p>{currentFeel}</p>
          </div>
        </div>
        <div className="absolute top-0 -right-1 w-full h-full bg-black/50 backdrop-blur-xs blur-xs z-0 scale-y-150 scale-x-110"></div>

        <hr className="w-full border-white/40 z-1 my-2" />

        <div className="flex flex-row justify-between w-full z-1 gap-6">
          {forecast
            .filter((_f, i) => i % 3 === 0 && i < 9)
            .map((f) => (
              <div
                key={f.DateTime}
                className="flex flex-col items-center gap-2"
              >
                <div className="text-3xl font-regular">
                  {dayjs(f.DateTime).format("h a")}
                </div>
                <div className="text-5xl">
                  {mapIconPhraseToIcon(f.IconPhrase, f.IsDaylight)}
                </div>
                <div className="text-4xl">
                  {Math.round(f.Temperature.Value)}°
                </div>
              </div>
            ))}
        </div>

        <hr className="w-full border-white/40 z-1 mt-2 mb-0" />

        <div className="z-1 text-2xl max-w-[300px]">
          Tomorrow shall be sunny and hot with a high of 35° and a low of 26°.
        </div>
      </div>
    </div>
  );
}

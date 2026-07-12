import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import dayjs from "dayjs";
import Clock from "./components/Clock";
import PrayerTimes from "./components/PrayerTimes";
import Weather from "./components/Weather";
import Toaster from "./components/Toaster";
import { fetchJson } from "./config";

export default function App(): ReactElement {
  const [, setWallpaper] = useState("");

  useEffect(() => {
    const updateWallpaper = async () => {
      try {
        const data = await fetchJson<{ urls: { regular: string } }>("/gambar");
        document.body.style.backgroundImage = `url("${data.urls.regular}")`;
        setWallpaper(data.urls.regular);

        setTimeout(
          updateWallpaper,
          dayjs().endOf("hour").add(1, "second").diff(dayjs()),
        );
      } catch {
        setTimeout(updateWallpaper, 1000);
      }
    };
    updateWallpaper();
  }, []);

  return (
    <div className="h-screen flex flex-row justify-between">
      <Clock />
      <Weather />
      <PrayerTimes />
      <Toaster />
    </div>
  );
}

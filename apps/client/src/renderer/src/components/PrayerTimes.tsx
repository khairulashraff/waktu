import { useState, useEffect } from "react";
import type { ReactElement } from "react";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import { fetchJson } from "../config";

dayjs.extend(isSameOrAfter);

interface PrayerTimings {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

interface PrayerDay {
  timings: PrayerTimings;
  date: {
    gregorian: { date: string };
    hijri: { day: string; month: { number: number }; year: string };
  };
}

interface Prayer {
  name: string;
  time: dayjs.Dayjs;
  isCurrent: boolean;
  isPast: boolean;
}

function timingToDayjs(s: string, dayOffset = 0): dayjs.Dayjs {
  const split = s.substr(0, 5).split(":");
  return dayjs()
    .add(dayOffset, "day")
    .hour(parseInt(split[0]))
    .minute(parseInt(split[1]));
}

function timeFromNow(until: dayjs.Dayjs): string {
  const diff = until.diff(dayjs(), "minute");
  if (diff >= 60) {
    const val = Math.floor(diff / 60);
    return `${val}h ${diff % 60}m`;
  }
  return `${diff}m`;
}

export default function PrayerTimes(): ReactElement {
  const [timeTillNext, setTimeTillNext] = useState("");
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [monthlySolat, setMonthlySolat] = useState<PrayerDay[]>([]);
  const [todaySolat, setTodaySolat] = useState<PrayerDay | null>(null);
  const [tomorrowSolat, setTomorrowSolat] = useState<PrayerDay | null>(null);

  useEffect(() => {
    const fetchPrayerTimes = async () => {
      try {
        const data = await fetchJson<PrayerDay[]>("/solat");
        setMonthlySolat(data);
        setTimeout(
          fetchPrayerTimes,
          dayjs().endOf("day").add(1, "second").diff(dayjs()),
        );
      } catch {
        setTimeout(fetchPrayerTimes, 1000);
      }
    };
    fetchPrayerTimes();
  }, []);

  useEffect(() => {
    if (monthlySolat && monthlySolat.length) {
      const now = dayjs();
      const esok = dayjs().add(1, "day");
      let today: PrayerDay | null = null;
      let tomorrow: PrayerDay | null = null;

      monthlySolat.forEach((day) => {
        if (day.date.gregorian.date === now.format("DD-MM-YYYY")) {
          today = day;
        } else if (day.date.gregorian.date === esok.format("DD-MM-YYYY")) {
          tomorrow = day;
        }
      });

      setTodaySolat(today);
      setTomorrowSolat(tomorrow);
    }
  }, [monthlySolat]);

  useEffect(() => {
    const updateSolat = () => {
      if (todaySolat && tomorrowSolat) {
        const now = dayjs();
        const subuh = timingToDayjs(todaySolat.timings.Fajr);
        const sunrise = timingToDayjs(todaySolat.timings.Sunrise).add(
          15,
          "minute",
        );
        const zuhur = timingToDayjs(todaySolat.timings.Dhuhr);
        const asar = timingToDayjs(todaySolat.timings.Asr);
        const maghrib = timingToDayjs(todaySolat.timings.Maghrib);
        const isha = timingToDayjs(todaySolat.timings.Isha);
        const subuhTomorrow = timingToDayjs(tomorrowSolat.timings.Fajr, 1);
        const midnight = dayjs().endOf("day").add(1, "second");
        let newTimeTillNext = "";

        const allPrayers: Prayer[] = [
          { name: "Subuh", time: subuh, isCurrent: false, isPast: false },
          { name: "Duha", time: sunrise, isCurrent: false, isPast: false },
          { name: "Zuhur", time: zuhur, isCurrent: false, isPast: false },
          { name: "Asar", time: asar, isCurrent: false, isPast: false },
          { name: "Maghrib", time: maghrib, isCurrent: false, isPast: false },
          { name: "Isha'", time: isha, isCurrent: false, isPast: false },
        ];

        if (now.isSameOrAfter(subuh) && now.isBefore(sunrise)) {
          newTimeTillNext = `${timeFromNow(sunrise)}`;
          allPrayers[0].isCurrent = true;
        } else if (now.isSameOrAfter(sunrise) && now.isBefore(zuhur)) {
          newTimeTillNext = `${timeFromNow(zuhur)}`;
          allPrayers[0].isPast = true;
          allPrayers[1].isCurrent = true;
        } else if (now.isSameOrAfter(zuhur) && now.isBefore(asar)) {
          newTimeTillNext = `${timeFromNow(asar)}`;
          allPrayers[0].isPast = true;
          allPrayers[1].isPast = true;
          allPrayers[2].isCurrent = true;
        } else if (now.isSameOrAfter(asar) && now.isBefore(maghrib)) {
          newTimeTillNext = `${timeFromNow(maghrib)}`;
          allPrayers[0].isPast = true;
          allPrayers[1].isPast = true;
          allPrayers[2].isPast = true;
          allPrayers[3].isCurrent = true;
        } else if (now.isSameOrAfter(maghrib) && now.isBefore(isha)) {
          newTimeTillNext = `${timeFromNow(isha)}`;
          allPrayers[0].isPast = true;
          allPrayers[1].isPast = true;
          allPrayers[2].isPast = true;
          allPrayers[3].isPast = true;
          allPrayers[4].isCurrent = true;
        } else if (
          (now.isSameOrAfter(isha) && now.isBefore(midnight)) ||
          now.isBefore(subuhTomorrow)
        ) {
          newTimeTillNext = `${timeFromNow(now.isAfter(isha) && now.isBefore(midnight) ? subuhTomorrow : subuh)}`;
          allPrayers[0].isPast = true;
          allPrayers[1].isPast = true;
          allPrayers[2].isPast = true;
          allPrayers[3].isPast = true;
          allPrayers[4].isPast = true;
          allPrayers[5].isCurrent = true;
        }

        setPrayers(allPrayers);
        setTimeTillNext(newTimeTillNext);
      }
    };

    updateSolat();
    const interval = setInterval(updateSolat, 1000 * 60);
    return () => clearInterval(interval);
  }, [todaySolat, tomorrowSolat]);

  return (
    <div
      id="solat-wrapper"
      className="inline-flex flex-col gap-1 justify-center w-95 relative bg-gray-800 drop-shadow-md/50"
    >
      {prayers.map((p) => (
        <div
          key={p.name}
          className={`flex w-full justify-between z-1 font-thin relative ${
            p.isCurrent
              ? "flex-col items-start pt-1 pb-2 px-5 my-4 bg-yellow-700/60 drop-shadow-md border-l-5 border-0 border-yellow-400/50"
              : p.isPast
                ? "text-lg opacity-30 gap-2 px-8"
                : "text-lg opacity-70 gap-2 px-8"
          }`}
        >
          <div
            className={
              p.isCurrent
                ? "text-5xl scale-y-90 text-orange-400 font-normal -mb-1 relative top-2"
                : "text-3xl"
            }
          >
            {p.name}
          </div>
          {p.isCurrent ? (
            <>
              <div className="flex justify-center text-8xl opacity-80">
                {timeTillNext}
              </div>
              <div className="text-2xl text-white tracking-widest leading-5 relative -top-1 font-light">
                remaining
              </div>
            </>
          ) : (
            <div className="flex text-md opacity-70 items-end pb-0.5">
              {p.time.format("h:mm A")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

import { useState, useEffect } from "react";
import type { ReactElement } from "react";
import dayjs from "dayjs";

export default function Clock(): ReactElement {
  const [now, setNow] = useState(dayjs());
  const [seconds, setSeconds] = useState(now.second());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(dayjs());
      setSeconds(dayjs().second());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      id="datetime"
      className="flex flex-col items-start justify-end h-full pl-4"
    >
      <div className="text-4xl pl-4 translate-y-2 text-shadow-sm/20">
        <span id="day">{now.format("ddd, D MMM")}</span>
      </div>
      <div
        id="clock"
        className="text-[12rem] leading-[11rem] font-mono flex flex-row items-end"
      >
        <div className="flex flex-row items-center text-shadow-lg/50">
          {now.format("HH")}
          <span className="text-7xl">:</span>
          {now.format("mm")}
        </div>
        <span id="seconds" className="text-7xl font-thin mb-3">
          :{String(seconds).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

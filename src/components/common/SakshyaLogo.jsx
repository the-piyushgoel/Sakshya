import React from "react";

export const SakshyaLogo = ({ size = "default", light = false, showSubtitle = true }) => {
  const isLarge = size === "large";
  const isSmall = size === "small";

  return (
    <div className="flex items-center gap-3">
      {/* SVG Emblem - Ashoka Chakra / Sunburst Wheel matching Figma */}
      <div
        className={`relative flex items-center justify-center rounded-full border border-amber-400/40 bg-gradient-to-br from-amber-500/10 to-amber-600/20 shadow-inner ${
          isLarge ? "w-14 h-14" : isSmall ? "w-8 h-8" : "w-10 h-10"
        }`}
      >
        <svg
          viewBox="0 0 100 100"
          className={`text-amber-400 ${isLarge ? "w-10 h-10" : isSmall ? "w-6 h-6" : "w-8 h-8"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          {/* Outer Ring */}
          <circle cx="50" cy="50" r="44" strokeWidth="2.5" stroke="currentColor" />
          {/* Inner Ring */}
          <circle cx="50" cy="50" r="14" strokeWidth="2" stroke="currentColor" fill="currentColor" fillOpacity="0.2" />
          <circle cx="50" cy="50" r="5" fill="currentColor" />
          {/* 24 Spokes */}
          {Array.from({ length: 24 }).map((_, i) => {
            const angle = (i * 360) / 24;
            const rad = (angle * Math.PI) / 180;
            const x1 = 50 + 14 * Math.cos(rad);
            const y1 = 50 + 14 * Math.sin(rad);
            const x2 = 50 + 44 * Math.cos(rad);
            const y2 = 50 + 44 * Math.sin(rad);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth="1.6"
              />
            );
          })}
        </svg>
      </div>

      {/* Typography */}
      <div className="flex flex-col">
        <span
          className={`font-serif tracking-widest font-bold leading-tight ${
            isLarge
              ? "text-3xl tracking-widest text-white"
              : isSmall
              ? "text-lg text-white"
              : "text-xl text-white"
          } ${light ? "text-slate-900" : "text-white"}`}
        >
          SAKSHYA
        </span>
        {showSubtitle && (
          <span
            className={`font-sans tracking-wide leading-none ${
              isLarge
                ? "text-sm text-slate-300 mt-1"
                : isSmall
                ? "text-[10px] text-slate-400"
                : "text-[11px] text-slate-300"
            }`}
          >
            सुरक्षा निधि एवं एफडीआर प्रबंधन
          </span>
        )}
      </div>
    </div>
  );
};


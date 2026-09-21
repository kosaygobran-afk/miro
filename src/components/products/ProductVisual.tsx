"use client";

import { useId } from "react";

import type { ProductVisualKind } from "@/features/catalog/product-visual-kind";

/** Original illustrative hardware. These renders are not manufacturer photography. */
export function ProductVisual({
  kind = "dome",
  className = "",
}: {
  kind?: ProductVisualKind;
  className?: string;
}) {
  const id = useId().replaceAll(":", "");
  const paint = (name: string) => `url(#${id}-${name})`;
  const ports = Array.from({ length: 8 }, (_, index) => index);

  return (
    <svg
      className={`sf-product-visual ${className}`}
      viewBox="0 0 320 240"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={`${id}-metal`}
          x1="70"
          y1="40"
          x2="230"
          y2="200"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff" />
          <stop offset=".33" stopColor="#e3e7e9" />
          <stop offset=".7" stopColor="#a9b0b6" />
          <stop offset="1" stopColor="#e2e7e9" />
        </linearGradient>
        <linearGradient
          id={`${id}-dark`}
          x1="90"
          y1="50"
          x2="220"
          y2="200"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#56616c" />
          <stop offset=".22" stopColor="#252d35" />
          <stop offset=".65" stopColor="#0e1319" />
          <stop offset="1" stopColor="#343e48" />
        </linearGradient>
        <linearGradient
          id={`${id}-edge`}
          x1="60"
          y1="60"
          x2="245"
          y2="155"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#829099" />
          <stop offset=".25" stopColor="#3c464f" />
          <stop offset="1" stopColor="#10161c" />
        </linearGradient>
        <radialGradient id={`${id}-glass`} cx=".35" cy=".3" r=".8">
          <stop stopColor="#668b9b" />
          <stop offset=".2" stopColor="#1c4050" />
          <stop offset=".45" stopColor="#07151d" />
          <stop offset=".74" stopColor="#1c3945" />
          <stop offset="1" stopColor="#020709" />
        </radialGradient>
        <radialGradient id={`${id}-shadow`}>
          <stop stopColor="#000" stopOpacity=".4" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="160" cy="211" rx="118" ry="17" fill={paint("shadow")} />
      {kind === "bullet" && (
        <g>
          <ellipse
            cx="257"
            cy="100"
            rx="21"
            ry="55"
            fill={paint("dark")}
            stroke="#74818b"
          />
          <path d="M238 89h-28v24h31" fill={paint("edge")} stroke="#75818a" />
          <path
            d="m96 56 109 12c17 2 32 23 31 43-1 23-11 39-28 39L93 145Z"
            fill={paint("dark")}
            stroke="#717d87"
          />
          <path
            d="M72 65q3-16 26-17l116 13 17 15L91 69Z"
            fill={paint("edge")}
            stroke="#9099a1"
          />
          <ellipse
            cx="95"
            cy="112"
            rx="48"
            ry="56"
            fill="#10151b"
            stroke="#818b94"
            strokeWidth="2"
          />
          <ellipse
            cx="95"
            cy="112"
            rx="39"
            ry="47"
            fill="#080d12"
            stroke="#444f59"
            strokeWidth="3"
          />
          <ellipse
            cx="95"
            cy="112"
            rx="25"
            ry="31"
            fill={paint("glass")}
            stroke="#7b8994"
            strokeWidth="2"
          />
          <ellipse
            cx="95"
            cy="112"
            rx="14"
            ry="19"
            fill="#04080b"
            stroke="#2d5c72"
            strokeWidth="3"
          />
          <ellipse cx="87" cy="99" rx="6" ry="8" fill="#96bec8" opacity=".45" />
          {[0, 1, 2, 3].map((n) => (
            <circle
              key={n}
              cx={n % 2 ? 124 : 67}
              cy={n < 2 ? 89 : 137}
              r="3"
              fill="#6b767e"
            />
          ))}
          <path d="m158 97 8 1v17l-8-1Zm12 2 4 1v16l-4-1Z" fill="#e3e8eb" />
          <path d="m179 100 4 1v16l-4-1Z" fill="#efc32e" />
        </g>
      )}
      {kind === "dome" && (
        <g>
          <path
            d="M78 101C78 65 113 43 160 43s82 22 82 58v14H78Z"
            fill={paint("metal")}
            stroke="#c6cdd1"
          />
          <ellipse
            cx="160"
            cy="107"
            rx="82"
            ry="26"
            fill={paint("metal")}
            stroke="#a9b1b8"
          />
          <path
            d="M92 105c0 55 24 95 68 95s68-40 68-95c-34 17-101 18-136 0Z"
            fill={paint("dark")}
            stroke="#6f7d86"
          />
          <ellipse
            cx="160"
            cy="147"
            rx="40"
            ry="43"
            fill="#0c1116"
            stroke="#5d6973"
            strokeWidth="5"
          />
          <ellipse
            cx="160"
            cy="147"
            rx="30"
            ry="32"
            fill={paint("glass")}
            stroke="#83929e"
            strokeWidth="2"
          />
          <circle
            cx="160"
            cy="147"
            r="19"
            fill="#04090d"
            stroke="#245468"
            strokeWidth="4"
          />
          <ellipse
            cx="151"
            cy="137"
            rx="7"
            ry="5"
            fill="#a3d4df"
            opacity=".5"
          />
          <path
            d="M106 120c-1 29 5 44 19 58"
            stroke="#d7e2e8"
            opacity=".24"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="M142 78h9v12h-9Zm14 0h5v12h-5Z" fill="#23292e" />
          <path d="M166 78h5v12h-5Z" fill="#dba817" />
        </g>
      )}
      {kind === "intercom" && (
        <g>
          <rect
            x="119"
            y="27"
            width="89"
            height="181"
            rx="22"
            fill={paint("edge")}
            stroke="#8b969f"
          />
          <rect
            x="111"
            y="25"
            width="88"
            height="181"
            rx="21"
            fill={paint("dark")}
            stroke="#adb6bf"
            strokeWidth="1.5"
          />
          <rect
            x="120"
            y="33"
            width="70"
            height="98"
            rx="16"
            fill="#080c11"
            stroke="#515e69"
          />
          <circle
            cx="155"
            cy="76"
            r="22"
            fill={paint("glass")}
            stroke="#6b7a85"
            strokeWidth="3"
          />
          <circle
            cx="155"
            cy="76"
            r="12"
            fill="#03080b"
            stroke="#316176"
            strokeWidth="2"
          />
          <circle cx="150" cy="69" r="4" fill="#d0f6ff" opacity=".4" />
          <circle cx="155" cy="111" r="5" fill="#152c37" stroke="#405661" />
          <circle
            cx="155"
            cy="169"
            r="21"
            fill="#101b22"
            stroke="#84d7e0"
            strokeWidth="3"
          />
          <circle cx="155" cy="169" r="17" stroke="#314e5b" />
          <circle cx="155" cy="44" r="3" fill="#647983" />
        </g>
      )}
      {kind === "alarm" && (
        <g>
          <rect
            x="83"
            y="48"
            width="150"
            height="137"
            rx="29"
            fill={paint("metal")}
            stroke="#edf2f5"
            strokeWidth="1.5"
          />
          <rect
            x="91"
            y="53"
            width="133"
            height="125"
            rx="24"
            stroke="#fff"
            opacity=".5"
          />
          <path d="m145 112 14-10 14 10v20h-10v-12h-8v12h-10Z" fill="#56626c" />
          <path
            d="M151 160h15"
            stroke="#4ab9c8"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect
            x="50"
            y="114"
            width="42"
            height="84"
            rx="12"
            fill={paint("metal")}
            stroke="#fff"
          />
          <rect
            x="58"
            y="122"
            width="26"
            height="36"
            rx="8"
            fill="#e4e9ec"
            stroke="#b8c3ca"
          />
          <circle cx="71" cy="181" r="2" fill="#71b7c8" />
          <rect
            x="231"
            y="117"
            width="27"
            height="78"
            rx="9"
            fill={paint("metal")}
            stroke="#edf1f4"
          />
          <rect
            x="265"
            y="118"
            width="12"
            height="50"
            rx="5"
            fill={paint("metal")}
          />
        </g>
      )}
      {kind === "router" && (
        <g>
          <ellipse
            cx="160"
            cy="144"
            rx="99"
            ry="53"
            fill="#8e999f"
            stroke="#d4dce1"
          />
          <ellipse
            cx="160"
            cy="136"
            rx="99"
            ry="53"
            fill={paint("metal")}
            stroke="#fff"
          />
          <ellipse cx="160" cy="131" rx="87" ry="43" stroke="#edf3f5" />
          <ellipse cx="160" cy="135" rx="17" ry="9" stroke="#bbc9d1" />
          <path
            d="M152 135h16"
            stroke="#698e9c"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M145 181q16 3 32-1"
            stroke="#57c7d4"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M123 67q37-22 74 0m-63 9q26-16 52 0"
            stroke="#92a4ad"
            strokeWidth="2"
            strokeLinecap="round"
            opacity=".45"
          />
        </g>
      )}
      {kind === "switch" && (
        <g>
          <path
            d="m48 112 54-42 170 27-36 46Z"
            fill={paint("edge")}
            stroke="#737f89"
          />
          <path d="m236 143 36-46v64l-36 42Z" fill="#171e25" stroke="#535f69" />
          <path
            d="m48 112 188 31v60L48 171Z"
            fill={paint("dark")}
            stroke="#82909a"
          />
          <path d="m53 117 178 29" stroke="#a8b1b9" opacity=".6" />
          {ports.map((n) => (
            <g
              key={n}
              transform={`translate(${83 + n * 17}, ${141 + n * 2.8})`}
            >
              <path d="M0 0 13 2v15L0 15Z" fill="#060a0d" stroke="#8a969f" />
              <path d="M3 2 10 3" stroke="#e8c970" strokeWidth="2" />
              <circle cx="9" cy="-5" r="1.7" fill="#72ddd1" />
            </g>
          ))}
          <circle cx="62" cy="140" r="2.4" fill="#80e9d9" />
          <circle cx="62" cy="151" r="2.4" fill="#eccc50" />
          {[0, 1, 2, 3].map((n) => (
            <path
              key={n}
              d={`m245 ${146 + n * 8} 16-19`}
              stroke="#03070b"
              strokeWidth="4"
            />
          ))}
        </g>
      )}
      {kind === "cable" && (
        <g>
          <ellipse
            cx="150"
            cy="138"
            rx="73"
            ry="47"
            stroke="#334652"
            strokeWidth="25"
          />
          <ellipse
            cx="150"
            cy="135"
            rx="72"
            ry="44"
            stroke="#718899"
            strokeWidth="3"
          />
          <ellipse
            cx="150"
            cy="141"
            rx="61"
            ry="34"
            stroke="#536c7c"
            strokeWidth="2"
          />
          <path
            d="M87 119C42 110 49 71 88 77l125 27q34 9 36-14"
            stroke="#496474"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <g transform="translate(231 44) rotate(10)">
            <rect
              width="29"
              height="47"
              rx="5"
              fill={paint("metal")}
              stroke="#c3d0d6"
            />
            <path d="M5 5h19v19H5Z" fill="#829ba9" />
            {[0, 1, 2, 3].map((n) => (
              <path
                key={n}
                d={`M${8 + n * 4} 5v13`}
                stroke="#e1bc57"
                strokeWidth="2"
              />
            ))}
          </g>
        </g>
      )}
      {kind === "lock" && (
        <g>
          <rect
            x="122"
            y="28"
            width="74"
            height="181"
            rx="17"
            fill={paint("dark")}
            stroke="#9da9b1"
          />
          <rect
            x="130"
            y="35"
            width="57"
            height="107"
            rx="11"
            fill="#070c11"
            stroke="#4b5964"
          />
          {Array.from({ length: 9 }, (_, n) => (
            <circle
              key={n}
              cx={143 + (n % 3) * 15}
              cy={57 + Math.floor(n / 3) * 23}
              r="2.4"
              fill="#c1cbd2"
            />
          ))}
          <circle
            cx="158"
            cy="150"
            r="17"
            fill={paint("metal")}
            stroke="#edf3f6"
          />
          <path
            d="M156 145h94q12 0 12 9t-12 9h-94Z"
            fill={paint("dark")}
            stroke="#a6b1b9"
            strokeWidth="2"
          />
          <circle cx="158" cy="188" r="7" fill="#0b1218" stroke="#778994" />
        </g>
      )}
    </svg>
  );
}

export function SecurityComposition({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div className={`sf-security-composition ${className}`} aria-hidden="true">
      <ProductVisual kind="bullet" />
      <ProductVisual kind="alarm" />
      <ProductVisual kind="intercom" />
      <ProductVisual kind="switch" />
    </div>
  );
}

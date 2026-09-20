export interface Product {
  id: string;
  name: string;
  description: string;
  priceIls: number;
  category: string;
  badge?: string;
  icon?: string; // Icon key: camera, server, router, cable, wrench, wifi, monitor, shield, hardDrive, siren, shieldCheck, key
}

export const productCategories = [
  { key: "cameras", label: "Cameras", href: "/products/cameras" },
  { key: "servers", label: "Servers & NVRs", href: "/products/servers" },
  { key: "routers", label: "Routers & Gateways", href: "/products/routers" },
  { key: "cables", label: "Cables & Connectors", href: "/products/cables" },
  { key: "accessories", label: "Accessories", href: "/products/accessories" },
  { key: "networkGear", label: "Network Gear", href: "/products/network-gear" },
] as const;

export type ProductCategoryKey = (typeof productCategories)[number]["key"];

export const mockProducts: Product[] = [
  // Cameras
  {
    id: "camera-dome-pro",
    name: "MIRO Pro Dome Camera 4K",
    description:
      "Professional 4K IP dome camera with AI analytics, IR night vision up to 30m, and IP67 weather rating.",
    priceIls: 1290,
    category: "cameras",
    badge: "Best Seller",
    icon: "camera",
  },
  {
    id: "camera-bullet-ai",
    name: "AI Bullet Camera 5MP",
    description:
      "5MP bullet camera with human/vehicle detection, two-way audio, and microSD storage up to 256GB.",
    priceIls: 890,
    category: "cameras",
    badge: "New",
    icon: "camera",
  },
  {
    id: "camera-ptz-outdoor",
    name: "Outdoor PTZ Camera 4K 25x",
    description:
      "Pan-tilt-zoom camera with 25x optical zoom, auto-tracking, and heater for extreme temperatures.",
    priceIls: 3490,
    category: "cameras",
    icon: "camera",
  },
  {
    id: "camera-turret",
    name: "Turret Camera 2K ColorNight",
    description:
      "2K turret camera with full-color night vision, built-in mic/speaker, and PoE support.",
    priceIls: 650,
    category: "cameras",
    icon: "camera",
  },
  {
    id: "camera-fisheye",
    name: "360° Fisheye Camera 12MP",
    description:
      "Single-lens 360° coverage with dewarping modes, ideal for retail and open spaces.",
    priceIls: 1890,
    category: "cameras",
    icon: "camera",
  },
  {
    id: "camera-doorbell",
    name: "Smart Video Doorbell Pro",
    description:
      "Wired video doorbell with 2K HDR, package detection, and chime integration.",
    priceIls: 790,
    category: "cameras",
    badge: "Popular",
    icon: "camera",
  },

  // Servers & NVRs
  {
    id: "nvr-8ch",
    name: "8-Channel NVR 4K H.265+",
    description:
      "8-channel network video recorder with 4K decoding, 8 PoE ports, and 2 SATA bays (up to 16TB).",
    priceIls: 1490,
    category: "servers",
    icon: "server",
  },
  {
    id: "nvr-16ch",
    name: "16-Channel NVR 4K AI",
    description:
      "16-channel AI NVR with face recognition, perimeter protection, and 4 SATA bays (up to 32TB).",
    priceIls: 2890,
    category: "servers",
    badge: "Enterprise",
    icon: "server",
  },
  {
    id: "nvr-32ch",
    name: "32-Channel Rackmount NVR",
    description:
      "Enterprise 32-channel 4K NVR with hot-swap drives, redundant PSU, and RAID 5/6/10 support.",
    priceIls: 6200,
    category: "servers",
    icon: "server",
  },
  {
    id: "server-storage",
    name: "Storage Server 8-Bay NAS",
    description:
      "8-bay rackmount NAS with Intel Xeon, 32GB ECC RAM, 10GbE, and ZFS support for video retention.",
    priceIls: 8900,
    category: "servers",
    icon: "hardDrive",
  },
  {
    id: "nvr-poe-switch",
    name: "16-Port PoE+ Switch for NVR",
    description:
      "Managed 16-port Gigabit PoE+ switch (200W budget) with VLAN, QoS, and SFP uplinks.",
    priceIls: 1250,
    category: "servers",
    icon: "server",
  },
  {
    id: "backup-appliance",
    name: "Backup Appliance 24TB",
    description:
      "Dedicated backup appliance with automated Veeam integration, ransomware protection, and cloud tiering.",
    priceIls: 4500,
    category: "servers",
    icon: "hardDrive",
  },

  // Routers & Gateways
  {
    id: "router-wifi6-pro",
    name: "Wi-Fi 6 Pro Router AX6000",
    description:
      "Tri-band Wi-Fi 6 router with 2.5G WAN/LAN, 8 streams, OFDMA, and VPN server/client built-in.",
    priceIls: 890,
    category: "routers",
    badge: "Top Pick",
    icon: "router",
  },
  {
    id: "router-wifi7",
    name: "Wi-Fi 7 Gateway BE11000",
    description:
      "Next-gen Wi-Fi 7 (802.11be) with 320MHz channels, MLO, 10G WAN, and 4× 2.5G LAN ports.",
    priceIls: 1890,
    category: "routers",
    badge: "New",
    icon: "router",
  },
  {
    id: "router-edge",
    name: "Edge Router 10G SFP+",
    description:
      "Carrier-grade edge router with 10G SFP+, 8× 2.5G RJ45, dual WAN, and advanced firewall/IDS.",
    priceIls: 2200,
    category: "routers",
    icon: "router",
  },
  {
    id: "router-mesh",
    name: "Mesh Wi-Fi 6 System (3-pack)",
    description:
      "Tri-band mesh system covering 6000 sq ft, seamless roaming, and easy app management.",
    priceIls: 1390,
    category: "routers",
    icon: "wifi",
  },
  {
    id: "gateway-5g",
    name: "5G Outdoor Gateway CPE",
    description:
      "Outdoor 5G NR / 4G LTE Cat 18 gateway with PoE, dual SIM, and external antenna ports.",
    priceIls: 1650,
    category: "routers",
    icon: "router",
  },
  {
    id: "router-vpn",
    name: "VPN Concentrator 500 Users",
    description:
      "Hardware VPN gateway supporting 500 concurrent SSL/IPsec tunnels, 2FA, and load balancing.",
    priceIls: 3200,
    category: "routers",
    icon: "shield",
  },

  // Cables & Connectors
  {
    id: "cable-cat6a",
    name: "Cat6a S/FTP Cable 305m Reel",
    description:
      "Shielded Cat6a 500MHz cable, LSZH jacket, PoE++ ready, ETL verified for 10GBASE-T.",
    priceIls: 890,
    category: "cables",
    icon: "cable",
  },
  {
    id: "cable-cat6",
    name: "Cat6 U/UTP Cable 305m Box",
    description:
      "Unshielded Cat6 250MHz, easy-pull box, 23AWG solid copper, verified for Gigabit PoE+.",
    priceIls: 420,
    category: "cables",
    badge: "Value",
    icon: "cable",
  },
  {
    id: "cable-fiber",
    name: "Fiber Patch Cord LC/LC OM4 10m",
    description:
      "Duplex OM4 multimode fiber patch cord, LC/UPC connectors, 50/125µm, aqua jacket.",
    priceIls: 85,
    category: "cables",
    icon: "cable",
  },
  {
    id: "cable-fiber-os2",
    name: "Fiber Patch Cord LC/LC OS2 20m",
    description:
      "Duplex OS2 single-mode fiber, LC/UPC, 9/125µm, yellow jacket, for long-distance links.",
    priceIls: 95,
    category: "cables",
    icon: "cable",
  },
  {
    id: "connector-rj45",
    name: "RJ45 Cat6a Shielded Connectors (50pcs)",
    description:
      "Tool-less shielded RJ45 plugs for Cat6a/7, 360° shielding, gold-plated contacts.",
    priceIls: 180,
    category: "cables",
    icon: "cable",
  },
  {
    id: "cable-hdmi",
    name: "HDMI 2.1 Cable 8K 3m",
    description:
      "Ultra High Speed HDMI 2.1, 48Gbps, 8K@60 / 4K@120, eARC, braided jacket.",
    priceIls: 120,
    category: "cables",
    icon: "cable",
  },

  // Accessories
  {
    id: "mount-wall",
    name: "Universal Wall Mount Bracket",
    description:
      "Heavy-duty adjustable wall mount for dome/bullet cameras, 3-axis rotation, cable management.",
    priceIls: 85,
    category: "accessories",
    icon: "wrench",
  },
  {
    id: "mount-pole",
    name: "Pole Mount Adapter Kit",
    description:
      "Stainless steel pole mount for cameras, fits 3-6 inch poles, includes U-bolts and hardware.",
    priceIls: 120,
    category: "accessories",
    icon: "wrench",
  },
  {
    id: "poe-injector",
    name: "PoE++ Injector 90W",
    description:
      "Single-port 802.3bt PoE++ injector (90W), Gigabit pass-through, plug-and-play.",
    priceIls: 220,
    category: "accessories",
    badge: "Essential",
    icon: "wrench",
  },
  {
    id: "poe-splitter",
    name: "PoE Splitter 12V/24V",
    description:
      "Gigabit PoE splitter with selectable 12V/24V DC output for non-PoE devices.",
    priceIls: 95,
    category: "accessories",
    icon: "wrench",
  },
  {
    id: "ups-mini",
    name: "Mini UPS 650VA for NVR",
    description:
      "Compact UPS with 390W output, USB monitoring, automatic voltage regulation, 4 outlets.",
    priceIls: 450,
    category: "accessories",
    icon: "hardDrive",
  },
  {
    id: "surge-protector",
    name: "Network Surge Protector Gigabit",
    description:
      "Inline Gigabit Ethernet surge protector, PoE pass-through, DIN rail mountable.",
    priceIls: 140,
    category: "accessories",
    icon: "shield",
  },

  // Network Gear
  {
    id: "switch-24port",
    name: "24-Port Gigabit Smart Switch",
    description:
      "Layer 2+ managed switch with 4× SFP, VLAN, QoS, LACP, PoE+ (370W budget), lifetime warranty.",
    priceIls: 1650,
    category: "networkGear",
    icon: "monitor",
  },
  {
    id: "switch-48port",
    name: "48-Port PoE+ Switch Layer 3",
    description:
      "Layer 3 managed switch, 48× PoE+ (740W), 4× 10G SFP+, stacking, redundancy, advanced security.",
    priceIls: 5800,
    category: "networkGear",
    badge: "Enterprise",
    icon: "monitor",
  },
  {
    id: "switch-8port",
    name: "8-Port Desktop PoE+ Switch",
    description:
      "Compact 8-port Gigabit PoE+ (130W), fanless, metal case, plug-and-play for small installs.",
    priceIls: 420,
    category: "networkGear",
    icon: "monitor",
  },
  {
    id: "ap-wifi6",
    name: "Ceiling Mount Wi-Fi 6 AP",
    description:
      "Dual-band Wi-Fi 6 access point, 2×2:2 MU-MIMO, PoE+, seamless roaming, controller managed.",
    priceIls: 690,
    category: "networkGear",
    icon: "wifi",
  },
  {
    id: "ap-outdoor",
    name: "Outdoor Wi-Fi 6 AP IP67",
    description:
      "Outdoor Wi-Fi 6 AP, 4×4:4, 2.5G PoE+, -40°C to 65°C, integrated antennas, mesh capable.",
    priceIls: 1150,
    category: "networkGear",
    icon: "wifi",
  },
  {
    id: "media-converter",
    name: "Fiber Media Converter Pair",
    description:
      "Gigabit fiber to copper media converter pair, SC single-mode 20km, PoE pass-through option.",
    priceIls: 380,
    category: "networkGear",
    icon: "cable",
  },
];

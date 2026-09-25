export interface ProductVariant {
  id: string;
  sku: string;
  colorHe: string;
  colorEn: string;
  colorHex: string;
  price: number | null;
  stockQty: number;
  lowStockThreshold: number;
  isDefault?: boolean;
}

export interface ProductImage {
  id: string;
  url: string;
  altHe?: string;
  altEn?: string;
  sortOrder: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  shortDescription?: string;
  priceIls: number | null;
  category: string;
  categorySlug: string;
  badge?: string;
  icon?: string;
  categoryLabel?: string;
  isFeatured?: boolean;
  rolePrice?: number;
  variants: ProductVariant[];
  stockQty: number;
  stockState: "in_stock" | "low" | "out";
  outOfStockPolicy:
    | "inherit"
    | "keep_visible_contact"
    | "keep_visible_restock"
    | "hide_from_public";
  expectedRestockDate: string | null;
  slug: string;
  brand?: string;
  modelNumber?: string;
  specifications?: Record<string, string>;
  warranty?: string;
  images: ProductImage[];
  seoTitle?: string;
  seoDescription?: string;
}

export const productCategories = [
  { key: "cameras", label: "Cameras", href: "/store/cameras" },
  { key: "servers", label: "Servers & NVRs", href: "/store/servers" },
  { key: "routers", label: "Routers & Gateways", href: "/store/routers" },
  { key: "cables", label: "Cables & Connectors", href: "/store/cables" },
  { key: "accessories", label: "Accessories", href: "/store/accessories" },
  { key: "networkGear", label: "Network Gear", href: "/store/network-gear" },
] as const;

export type ProductCategoryKey = (typeof productCategories)[number]["key"];

function baseProduct(
  id: string,
  name: string,
  description: string,
  shortDescription: string,
  price: number | null,
  category: string,
  badge?: string,
  icon?: string,
  isFeatured = false,
): Product {
  const categorySlug = category;
  const slug = id;
  const stockQty = price === null ? 0 : Math.floor(Math.random() * 30) + 5;
  const variants: ProductVariant[] =
    price === null
      ? []
      : [
          {
            id: `${id}-v1`,
            sku: `${id.toUpperCase()}-BLK`,
            colorHe: "שחור",
            colorEn: "Black",
            colorHex: "#1a1a1a",
            price,
            stockQty: Math.floor(stockQty * 0.6),
            lowStockThreshold: 3,
          },
          {
            id: `${id}-v2`,
            sku: `${id.toUpperCase()}-WHT`,
            colorHe: "לבן",
            colorEn: "White",
            colorHex: "#f5f5f5",
            price,
            stockQty: Math.floor(stockQty * 0.4),
            lowStockThreshold: 2,
          },
        ];
  const stockState =
    stockQty === 0 ? "out" : stockQty <= 5 ? "low" : "in_stock";
  const outOfStockPolicy =
    price === null ? "hide_from_public" : "keep_visible_contact";

  return {
    id,
    name,
    description,
    shortDescription,
    priceIls: price,
    category,
    categorySlug,
    badge,
    icon,
    isFeatured,
    variants,
    stockQty,
    stockState,
    outOfStockPolicy,
    expectedRestockDate: price === null ? "2026-11-15" : null,
    slug,
    brand: "MIRO",
    modelNumber: id.toUpperCase().replace(/-/g, "-"),
    specifications: {},
    warranty: "2 years",
    images: [
      {
        id: `${id}-img1`,
        url: `/images/products/${id}.jpg`,
        altHe: name,
        altEn: name,
        sortOrder: 1,
      },
    ],
    seoTitle: `${name} - MIRO Security & Communications`,
    seoDescription: shortDescription,
  };
}

export const mockProducts: Product[] = [
  // Cameras
  baseProduct(
    "camera-dome-pro",
    "MIRO Pro Dome Camera 4K",
    "Professional 4K IP dome camera with AI analytics, IR night vision up to 30m, and IP67 weather rating.",
    "Professional 4K IP dome camera with AI analytics and IP67 rating.",
    1290,
    "cameras",
    "Best Seller",
    "camera",
    true,
  ),
  baseProduct(
    "camera-bullet-ai",
    "AI Bullet Camera 5MP",
    "5MP bullet camera with human/vehicle detection, two-way audio, and microSD storage up to 256GB.",
    "5MP AI bullet camera with human/vehicle detection and two-way audio.",
    890,
    "cameras",
    "New",
    "camera",
  ),
  baseProduct(
    "camera-ptz-outdoor",
    "Outdoor PTZ Camera 4K 25x",
    "Pan-tilt-zoom camera with 25x optical zoom, auto-tracking, and heater for extreme temperatures.",
    "Outdoor PTZ with 25x optical zoom, auto-tracking, and extreme temperature heater.",
    3490,
    "cameras",
    undefined,
    "camera",
  ),
  baseProduct(
    "camera-turret",
    "Turret Camera 2K ColorNight",
    "2K turret camera with full-color night vision, built-in mic/speaker, and PoE support.",
    "2K turret with full-color night vision, mic/speaker, and PoE.",
    650,
    "cameras",
    undefined,
    "camera",
  ),
  baseProduct(
    "camera-fisheye",
    "360° Fisheye Camera 12MP",
    "Single-lens 360° coverage with dewarping modes, ideal for retail and open spaces.",
    "12MP 360° fisheye with dewarping modes for retail and open spaces.",
    1890,
    "cameras",
    undefined,
    "camera",
  ),
  baseProduct(
    "camera-doorbell",
    "Smart Video Doorbell Pro",
    "Wired video doorbell with 2K HDR, package detection, and chime integration.",
    "Wired 2K HDR video doorbell with package detection and chime integration.",
    790,
    "cameras",
    "Popular",
    "camera",
  ),

  // Servers & NVRs
  baseProduct(
    "nvr-8ch",
    "8-Channel NVR 4K H.265+",
    "8-channel network video recorder with 4K decoding, 8 PoE ports, and 2 SATA bays (up to 16TB).",
    "8-channel 4K NVR with 8 PoE ports and 2 SATA bays up to 16TB.",
    1490,
    "servers",
    undefined,
    "server",
  ),
  baseProduct(
    "nvr-16ch",
    "16-Channel NVR 4K AI",
    "16-channel AI NVR with face recognition, perimeter protection, and 4 SATA bays (up to 32TB).",
    "16-channel AI NVR with face recognition, perimeter protection, 4 SATA bays up to 32TB.",
    2890,
    "servers",
    "Enterprise",
    "server",
  ),
  baseProduct(
    "nvr-32ch",
    "32-Channel Rackmount NVR",
    "Enterprise 32-channel 4K NVR with hot-swap drives, redundant PSU, and RAID 5/6/10 support.",
    "Enterprise 32-channel 4K rackmount NVR with hot-swap drives, redundant PSU, RAID 5/6/10.",
    6200,
    "servers",
    undefined,
    "server",
  ),
  baseProduct(
    "server-storage",
    "Storage Server 8-Bay NAS",
    "8-bay rackmount NAS with Intel Xeon, 32GB ECC RAM, 10GbE, and ZFS support for video retention.",
    "8-bay rackmount NAS with Intel Xeon, 32GB ECC RAM, 10GbE, ZFS for video retention.",
    8900,
    "servers",
    undefined,
    "hardDrive",
  ),
  baseProduct(
    "nvr-poe-switch",
    "16-Port PoE+ Switch for NVR",
    "Managed 16-port Gigabit PoE+ switch (200W budget) with VLAN, QoS, and SFP uplinks.",
    "Managed 16-port PoE+ switch (200W) with VLAN, QoS, SFP uplinks.",
    1250,
    "servers",
    undefined,
    "server",
  ),
  baseProduct(
    "backup-appliance",
    "Backup Appliance 24TB",
    "Dedicated backup appliance with automated Veeam integration, ransomware protection, and cloud tiering.",
    "24TB backup appliance with Veeam integration, ransomware protection, cloud tiering.",
    4500,
    "servers",
    undefined,
    "hardDrive",
  ),

  // Routers & Gateways
  baseProduct(
    "router-wifi6-pro",
    "Wi-Fi 6 Pro Router AX6000",
    "Tri-band Wi-Fi 6 router with 2.5G WAN/LAN, 8 streams, OFDMA, and VPN server/client built-in.",
    "Tri-band Wi-Fi 6 AX6000 with 2.5G WAN/LAN, 8 streams, built-in VPN.",
    890,
    "routers",
    "Top Pick",
    "router",
  ),
  baseProduct(
    "router-wifi7",
    "Wi-Fi 7 Gateway BE11000",
    "Next-gen Wi-Fi 7 (802.11be) with 320MHz channels, MLO, 10G WAN, and 4× 2.5G LAN ports.",
    "Wi-Fi 7 BE11000 with 320MHz channels, MLO, 10G WAN, 4× 2.5G LAN.",
    1890,
    "routers",
    "New",
    "router",
  ),
  baseProduct(
    "router-edge",
    "Edge Router 10G SFP+",
    "Carrier-grade edge router with 10G SFP+, 8× 2.5G RJ45, dual WAN, and advanced firewall/IDS.",
    "Carrier-grade edge router with 10G SFP+, 8× 2.5G RJ45, dual WAN, advanced firewall/IDS.",
    2200,
    "routers",
    undefined,
    "router",
  ),
  baseProduct(
    "router-mesh",
    "Mesh Wi-Fi 6 System (3-pack)",
    "Tri-band mesh system covering 6000 sq ft, seamless roaming, and easy app management.",
    "Tri-band mesh Wi-Fi 6 (3-pack) covering 6000 sq ft with seamless roaming.",
    1390,
    "routers",
    undefined,
    "wifi",
  ),
  baseProduct(
    "gateway-5g",
    "5G Outdoor Gateway CPE",
    "Outdoor 5G NR / 4G LTE Cat 18 gateway with PoE, dual SIM, and external antenna ports.",
    "Outdoor 5G NR / 4G LTE Cat 18 gateway with PoE, dual SIM, external antennas.",
    1650,
    "routers",
    undefined,
    "router",
  ),
  baseProduct(
    "router-vpn",
    "VPN Concentrator 500 Users",
    "Hardware VPN gateway supporting 500 concurrent SSL/IPsec tunnels, 2FA, and load balancing.",
    "Hardware VPN gateway for 500 concurrent SSL/IPsec tunnels, 2FA, load balancing.",
    3200,
    "routers",
    undefined,
    "shield",
  ),

  // Cables & Connectors
  baseProduct(
    "cable-cat6a",
    "Cat6a S/FTP Cable 305m Reel",
    "Shielded Cat6a 500MHz cable, LSZH jacket, PoE++ ready, ETL verified for 10GBASE-T.",
    "Shielded Cat6a 500MHz, LSZH, PoE++ ready, ETL verified for 10GBASE-T.",
    890,
    "cables",
    undefined,
    "cable",
  ),
  baseProduct(
    "cable-cat6",
    "Cat6 U/UTP Cable 305m Box",
    "Unshielded Cat6 250MHz, easy-pull box, 23AWG solid copper, verified for Gigabit PoE+.",
    "Unshielded Cat6 250MHz, easy-pull box, 23AWG copper, Gigabit PoE+ verified.",
    420,
    "cables",
    "Value",
    "cable",
  ),
  baseProduct(
    "cable-fiber",
    "Fiber Patch Cord LC/LC OM4 10m",
    "Duplex OM4 multimode fiber patch cord, LC/UPC connectors, 50/125µm, aqua jacket.",
    "Duplex OM4 multimode LC/LC 10m, 50/125µm, aqua jacket.",
    85,
    "cables",
    undefined,
    "cable",
  ),
  baseProduct(
    "cable-fiber-os2",
    "Fiber Patch Cord LC/LC OS2 20m",
    "Duplex OS2 single-mode fiber, LC/UPC, 9/125µm, yellow jacket, for long-distance links.",
    "Duplex OS2 single-mode LC/LC 20m, 9/125µm, yellow jacket, long-distance.",
    95,
    "cables",
    undefined,
    "cable",
  ),
  baseProduct(
    "connector-rj45",
    "RJ45 Cat6a Shielded Connectors (50pcs)",
    "Tool-less shielded RJ45 plugs for Cat6a/7, 360° shielding, gold-plated contacts.",
    "Tool-less shielded RJ45 for Cat6a/7, 360° shielding, gold contacts (50pcs).",
    180,
    "cables",
    undefined,
    "cable",
  ),
  baseProduct(
    "cable-hdmi",
    "HDMI 2.1 Cable 8K 3m",
    "Ultra High Speed HDMI 2.1, 48Gbps, 8K@60 / 4K@120, eARC, braided jacket.",
    "Ultra High Speed HDMI 2.1, 48Gbps, 8K@60/4K@120, eARC, braided (3m).",
    120,
    "cables",
    undefined,
    "cable",
  ),

  // Accessories
  baseProduct(
    "mount-wall",
    "Universal Wall Mount Bracket",
    "Heavy-duty adjustable wall mount for dome/bullet cameras, 3-axis rotation, cable management.",
    "Heavy-duty adjustable wall mount for dome/bullet cameras, 3-axis rotation.",
    85,
    "accessories",
    undefined,
    "wrench",
  ),
  baseProduct(
    "mount-pole",
    "Pole Mount Adapter Kit",
    "Stainless steel pole mount for cameras, fits 3-6 inch poles, includes U-bolts and hardware.",
    "Stainless steel pole mount for 3-6 inch poles, U-bolts and hardware included.",
    120,
    "accessories",
    undefined,
    "wrench",
  ),
  baseProduct(
    "poe-injector",
    "PoE++ Injector 90W",
    "Single-port 802.3bt PoE++ injector (90W), Gigabit pass-through, plug-and-play.",
    "Single-port 802.3bt PoE++ 90W injector, Gigabit pass-through, plug-and-play.",
    220,
    "accessories",
    "Essential",
    "wrench",
  ),
  baseProduct(
    "poe-splitter",
    "PoE Splitter 12V/24V",
    "Gigabit PoE splitter with selectable 12V/24V DC output for non-PoE devices.",
    "Gigabit PoE splitter, selectable 12V/24V DC output for non-PoE devices.",
    95,
    "accessories",
    undefined,
    "wrench",
  ),
  baseProduct(
    "ups-mini",
    "Mini UPS 650VA for NVR",
    "Compact UPS with 390W output, USB monitoring, automatic voltage regulation, 4 outlets.",
    "Compact 650VA UPS, 390W, USB monitoring, AVR, 4 outlets.",
    450,
    "accessories",
    undefined,
    "hardDrive",
  ),
  baseProduct(
    "surge-protector",
    "Network Surge Protector Gigabit",
    "Inline Gigabit Ethernet surge protector, PoE pass-through, DIN rail mountable.",
    "Inline Gigabit surge protector, PoE pass-through, DIN rail mountable.",
    140,
    "accessories",
    undefined,
    "shield",
  ),

  // Network Gear
  baseProduct(
    "switch-24port",
    "24-Port Gigabit Smart Switch",
    "Layer 2+ managed switch with 4× SFP, VLAN, QoS, LACP, PoE+ (370W budget), lifetime warranty.",
    "Layer 2+ managed 24-port with 4× SFP, VLAN, QoS, LACP, PoE+ 370W, lifetime warranty.",
    1650,
    "networkGear",
    undefined,
    "monitor",
  ),
  baseProduct(
    "switch-48port",
    "48-Port PoE+ Switch Layer 3",
    "Layer 3 managed switch, 48× PoE+ (740W), 4× 10G SFP+, stacking, redundancy, advanced security.",
    "Layer 3 managed 48-port PoE+ 740W, 4× 10G SFP+, stacking, redundancy, advanced security.",
    5800,
    "networkGear",
    "Enterprise",
    "monitor",
  ),
  baseProduct(
    "switch-8port",
    "8-Port Desktop PoE+ Switch",
    "Compact 8-port Gigabit PoE+ (130W), fanless, metal case, plug-and-play for small installs.",
    "Compact 8-port Gigabit PoE+ 130W, fanless, metal, plug-and-play.",
    420,
    "networkGear",
    undefined,
    "monitor",
  ),
  baseProduct(
    "ap-wifi6",
    "Ceiling Mount Wi-Fi 6 AP",
    "Dual-band Wi-Fi 6 access point, 2×2:2 MU-MIMO, PoE+, seamless roaming, controller managed.",
    "Ceiling-mount Wi-Fi 6 AP, 2×2:2 MU-MIMO, PoE+, seamless roaming, controller managed.",
    690,
    "networkGear",
    undefined,
    "wifi",
  ),
  baseProduct(
    "ap-outdoor",
    "Outdoor Wi-Fi 6 AP IP67",
    "Outdoor Wi-Fi 6 AP, 4×4:4, 2.5G PoE+, -40°C to 65°C, integrated antennas, mesh capable.",
    "Outdoor Wi-Fi 6 AP IP67, 4×4:4, 2.5G PoE+, -40°C to 65°C, mesh capable.",
    1150,
    "networkGear",
    undefined,
    "wifi",
  ),
  baseProduct(
    "media-converter",
    "Fiber Media Converter Pair",
    "Gigabit fiber to copper media converter pair, SC single-mode 20km, PoE pass-through option.",
    "Gigabit fiber-to-copper converter pair, SC single-mode 20km, PoE pass-through.",
    380,
    "networkGear",
    undefined,
    "cable",
  ),

  // Unpublished price examples (for testing priceUnpublished)
  baseProduct(
    "camera-unpublished",
    "MIRO Pro Camera (Unpublished Price)",
    "Professional camera with unpublished pricing. Contact us for details.",
    "Professional camera - price available on request.",
    null,
    "cameras",
    undefined,
    "camera",
  ),
  baseProduct(
    "server-unpublished",
    "Storage Server (Unpublished Price)",
    "High-capacity storage server with unpublished pricing. Contact us for details.",
    "High-capacity storage server - price available on request.",
    null,
    "servers",
    undefined,
    "server",
  ),
];

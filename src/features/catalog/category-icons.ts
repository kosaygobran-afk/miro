import {
  Cable,
  Camera,
  KeyRound,
  Router,
  Server,
  ShieldCheck,
  Wrench,
} from "lucide-react";

const categoryIcons: Record<string, typeof Camera> = {
  cameras: Camera,
  servers: Server,
  routers: Router,
  cables: Cable,
  accessories: Wrench,
  networkGear: Router,
  alarms: ShieldCheck,
  intercom: KeyRound,
};

export function getCategoryIcon(key: string) {
  return categoryIcons[key] ?? ShieldCheck;
}

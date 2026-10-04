import { SALES_CHANNEL_LABELS, type SalesChannel } from "@/lib/sales-channel";

export type SalesChannelBadgeProps = {
  channel: SalesChannel | "legacy";
  locale: "he" | "en";
  className?: string;
};

/**
 * Consistent sales-source badge. The semantic colors come from the
 * --sales-channel-pos / --sales-channel-website tokens (globals.css);
 * the text label is mandatory — source is never conveyed by color alone.
 */
export function SalesChannelBadge({
  channel,
  locale,
  className,
}: SalesChannelBadgeProps) {
  return (
    <span
      className={`mgmt-sales-channel-badge${className ? ` ${className}` : ""}`}
      data-sales-channel={channel}
    >
      {SALES_CHANNEL_LABELS[channel][locale]}
    </span>
  );
}

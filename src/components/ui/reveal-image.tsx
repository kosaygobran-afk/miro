"use client";

import Image, { type ImageProps } from "next/image";
import { useCallback, useRef, useState } from "react";

/** Keep the reserved image stage until decoding finishes; cached images skip the fade. */
export function RevealImage({
  alt,
  className,
  onLoad,
  onError,
  ...props
}: ImageProps) {
  const source =
    typeof props.src === "string"
      ? props.src
      : "src" in props.src
        ? props.src.src
        : props.src.default.src;
  const currentSource = useRef(source);
  const [readySource, setReadySource] = useState<string | null>(null);
  const [cachedSource, setCachedSource] = useState<string | null>(null);
  const imageRef = useCallback(
    (element: HTMLImageElement | null) => {
      currentSource.current = source;
      // Keep this ref stable when loading state changes so a fresh load is not reclassified as cached.
      if (element?.complete && element.naturalWidth > 0) {
        setCachedSource(source);
        setReadySource(source);
      }
    },
    [source],
  );

  return (
    <Image
      {...props}
      alt={alt}
      className={[className, "motion-image"].filter(Boolean).join(" ")}
      data-image-ready={readySource === source ? "true" : "false"}
      data-image-cached={cachedSource === source ? "true" : undefined}
      ref={imageRef}
      onLoad={async (event) => {
        const element = event.currentTarget;
        // Consumers still receive the normal synchronous image event before React clears currentTarget.
        onLoad?.(event);
        try {
          await element.decode();
        } catch {
          /* The load event already guarantees usable pixels. */
        }
        if (element.isConnected && currentSource.current === source)
          setReadySource(source);
      }}
      onError={(event) => {
        // Failed images also settle: parents may supply an illustration fallback.
        if (currentSource.current === source) setReadySource(source);
        onError?.(event);
      }}
    />
  );
}

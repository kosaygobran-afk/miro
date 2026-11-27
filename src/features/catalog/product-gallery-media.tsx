"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAnimationFeature } from "@/components/motion/animation-provider";
import { ProductMedia, type ProductImageStatus } from "./product-media";

type GalleryImage = {
  key: string;
  src?: string;
  alt: string;
  annotation?: ReactNode;
};

type SettledImage = GalleryImage & {
  status: Exclude<ProductImageStatus, "loading">;
};

/** Keep the decoded photo on screen while the next selection loads. */
export function ProductGalleryMedia({
  imageKey,
  src,
  alt,
  annotation,
  onImageStatusChange,
  ...mediaProps
}: Omit<
  React.ComponentProps<typeof ProductMedia>,
  "loading" | "onImageStatusChange"
> & {
  imageKey?: string;
  annotation?: ReactNode;
  onImageStatusChange?: (status: ProductImageStatus) => void;
}) {
  const key = JSON.stringify([imageKey, src]);
  const selection: GalleryImage = { key, src, alt, annotation };
  const animate = useAnimationFeature("imageReveal");
  const [displayed, setDisplayed] = useState<SettledImage | null>(null);
  const [outgoing, setOutgoing] = useState<SettledImage | null>(null);
  const [request, setRequest] = useState<{
    key: string;
    status: ProductImageStatus;
  }>({ key, status: src ? "loading" : "unavailable" });
  const outgoingLayer = useRef<HTMLDivElement>(null);
  const isSwitching = animate && outgoing !== null;

  if (!animate && outgoing) setOutgoing(null);
  if (request.key !== key) {
    const retained = [displayed, outgoing].find((image) => image?.key === key);
    setRequest({
      key,
      status: retained?.status ?? (src ? "loading" : "unavailable"),
    });
  } else if (request.status !== "loading" && !isSwitching) {
    if (displayed?.key !== key) {
      setDisplayed({ ...selection, status: request.status });
      setOutgoing(animate ? displayed : null);
    } else if (displayed.status !== request.status) {
      setDisplayed({ ...displayed, status: request.status });
    }
  }

  const handleStatusChange = useCallback(
    (status: ProductImageStatus) => {
      setRequest((current) =>
        current.key === key && current.status !== status
          ? { key, status }
          : current,
      );
    },
    [key],
  );
  const selectedStatus = displayed?.key === key ? request.status : "loading";
  useEffect(() => {
    onImageStatusChange?.(selectedStatus);
  }, [selectedStatus, onImageStatusChange]);

  useEffect(() => {
    const layer = outgoingLayer.current;
    if (!outgoing || !layer) return;
    let active = true;
    // CSS owns the timing. Cancellation also settles the swap when motion is switched off.
    void Promise.allSettled(
      layer.getAnimations().map(({ finished }) => finished),
    ).then(() => {
      if (active) setOutgoing(null);
    });
    return () => {
      active = false;
    };
  }, [outgoing]);

  const layers = [
    ...(isSwitching ? [{ image: outgoing, phase: "outgoing" }] : []),
    ...(displayed
      ? [
          {
            image: displayed.key === key ? selection : displayed,
            phase: isSwitching ? "incoming" : "current",
          },
        ]
      : []),
    ...(displayed?.key !== key && (!isSwitching || outgoing.key !== key)
      ? [{ image: selection, phase: displayed ? "pending" : "initial" }]
      : []),
  ];

  return (
    <div className="sf-product-gallery-media">
      {layers.map(({ image, phase }) => (
        <div
          key={image.key}
          ref={phase === "outgoing" ? outgoingLayer : undefined}
          className="sf-product-gallery-frame"
          data-gallery-frame={phase}
          aria-hidden={phase === "pending" || phase === "outgoing" || undefined}
        >
          <ProductMedia
            {...mediaProps}
            src={image.src}
            alt={image.alt}
            loading="eager"
            onImageStatusChange={
              image.key === key ? handleStatusChange : undefined
            }
          />
          {image.annotation}
        </div>
      ))}
    </div>
  );
}

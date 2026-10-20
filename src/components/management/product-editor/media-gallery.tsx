"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { RevealImage as Image } from "@/components/ui/reveal-image";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eraser,
  ImageIcon,
  Link2,
  Loader2,
  Pencil,
  Star,
  Trash2,
  Upload,
  Undo2,
} from "lucide-react";
import {
  ConfirmationDialog,
  Dialog,
  EmptyState,
  FormField,
  Skeleton,
  Notice,
} from "../ui";
import { editorCopy, mediaCopy } from "./copy";
import type { Locale, ProductImage } from "./types";
import type { BackgroundRemovalInfo } from "@/lib/product-image-processing";
import styles from "./product-editor.module.css";

type UploadItem = {
  key: string;
  name: string;
  progress: number;
  error: string | null;
  status:
    | "queued"
    | "uploading"
    | "processing"
    | "processed"
    | "transparent"
    | "original"
    | "failed";
};

type UrlUploadState = {
  url: string;
  altHe: string;
  altEn: string;
  loading: boolean;
  error: string;
  previewLoaded: boolean;
  previewError: boolean;
};

function uploadFile(
  file: File,
  productId: string,
  sortOrder: number,
  isPrimary: boolean,
  onProgress: (ratio: number) => void,
  uncertainMessage: string,
): Promise<BackgroundRemovalInfo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/management/product-images/upload");
    xhr.responseType = "json";
    xhr.timeout = 90000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.upload.onload = () => onProgress(1);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const body = xhr.response as {
          image?: { id?: string };
          background_removal?: BackgroundRemovalInfo;
        } | null;
        if (!body?.image?.id) {
          reject(new Error(uncertainMessage));
          return;
        }
        resolve({
          status: body?.background_removal?.status ?? "original",
          skipped: body?.background_removal?.skipped ?? true,
          reason: body?.background_removal?.reason ?? null,
        });
        return;
      }
      const body = xhr.response as { error?: string } | null;
      reject(new Error(body?.error ?? "Upload failed"));
    };
    xhr.onerror = () => reject(new Error(uncertainMessage));
    xhr.ontimeout = () => reject(new Error(uncertainMessage));
    xhr.onabort = () => reject(new Error(uncertainMessage));

    const form = new FormData();
    form.append("file", file);
    form.append("product_id", productId);
    form.append("sort_order", String(sortOrder));
    if (isPrimary) form.append("is_primary", "true");
    xhr.send(form);
  });
}

export function MediaGallery({
  locale,
  productId,
  onImagesChange,
}: {
  locale: Locale;
  productId: string;
  onImagesChange?: (images: ProductImage[]) => void;
}) {
  const he = locale === "he";
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [images, setImages] = useState<ProductImage[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [processingNotice, setProcessingNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [imageResults, setImageResults] = useState<
    Record<string, { message: string; error: boolean }>
  >({});
  const imageOperationRef = useRef(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProductImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [altEdit, setAltEdit] = useState<ProductImage | null>(null);
  const [altHe, setAltHe] = useState("");
  const [altEn, setAltEn] = useState("");
  const [altSaving, setAltSaving] = useState(false);
  const [altError, setAltError] = useState("");
  // URL upload state
  const [urlUploadOpen, setUrlUploadOpen] = useState(false);
  const [urlUpload, setUrlUpload] = useState<UrlUploadState>({
    url: "",
    altHe: "",
    altEn: "",
    loading: false,
    error: "",
    previewLoaded: false,
    previewError: false,
  });

  const loadImages = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(
        `/api/management/product-images?productId=${productId}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        setError(mediaCopy.imageOperationFailed[locale]);
        setImages([]);
        return;
      }
      const data = (await response.json()) as { images?: ProductImage[] };
      const nextImages = data.images ?? [];
      setImages(nextImages);
      onImagesChange?.(nextImages);
    } catch {
      setError(mediaCopy.imageOperationFailed[locale]);
      setImages([]);
    }
  }, [productId, locale, onImagesChange]);

  function announceSaved() {
    setSavedNotice(false);
    window.requestAnimationFrame(() => setSavedNotice(true));
  }

  // URL upload handlers
  function resetUrlUpload() {
    setUrlUpload({
      url: "",
      altHe: "",
      altEn: "",
      loading: false,
      error: "",
      previewLoaded: false,
      previewError: false,
    });
  }

  function handleUrlChange(value: string) {
    setUrlUpload((prev) => {
      const newState = {
        ...prev,
        url: value,
        error: "",
        previewLoaded: false,
        previewError: false,
      };
      // Reset preview when URL changes
      if (value.trim() && value.trim() !== prev.url.trim()) {
        newState.previewLoaded = false;
        newState.previewError = false;
      }
      return newState;
    });
  }

  function validateUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return mediaCopy.urlInvalid[locale];
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "https:" || url.username || url.password) {
        return mediaCopy.urlInvalid[locale];
      }
      return null;
    } catch {
      return mediaCopy.urlInvalid[locale];
    }
  }

  function getStatusLabel(
    status: UploadItem["status"],
    locale: Locale,
  ): string {
    const labels = {
      queued: mediaCopy.processingQueued,
      uploading: mediaCopy.processingUploading,
      processing: mediaCopy.processingSaving,
      processed: mediaCopy.processingBgRemoved,
      transparent: mediaCopy.processingAlreadyTransparent,
      original: mediaCopy.processingOriginal,
      failed: mediaCopy.uploadFailed,
    };
    return labels[status][locale];
  }

  async function addImageByUrl() {
    const urlError = validateUrl(urlUpload.url);
    if (urlError) {
      setUrlUpload((prev) => ({ ...prev, error: urlError }));
      return;
    }
    setUrlUpload((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const nextSort =
        (images?.reduce((max, img) => Math.max(max, img.sort_order), -1) ??
          -1) + 1;

      const response = await fetch("/api/management/product-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          image_url: urlUpload.url.trim(),
          alt_he: urlUpload.altHe || null,
          alt_en: urlUpload.altEn || null,
          sort_order: nextSort,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || mediaCopy.imageOperationFailed[locale]);
      }

      const data = (await response.json()) as {
        image?: ProductImage;
        background_removal?: BackgroundRemovalInfo;
      };

      // Show brief processing completion indicator
      setUrlUpload((prev) => ({ ...prev, loading: false }));

      resetUrlUpload();
      setUrlUploadOpen(false);
      await loadImages();
      announceSaved();

      setProcessingNotice(
        getStatusLabel(data.background_removal?.status ?? "original", locale),
      );
    } catch (err) {
      setUrlUpload((prev) => ({
        ...prev,
        loading: false,
        error:
          err instanceof Error
            ? err.message
            : mediaCopy.imageOperationFailed[locale],
      }));
    }
  }

  function openUrlUpload() {
    resetUrlUpload();
    setUrlUploadOpen(true);
  }

  function closeUrlUpload() {
    if (!urlUpload.loading) {
      setUrlUploadOpen(false);
      resetUrlUpload();
    }
  }

  function handleUrlLoad() {
    setUrlUpload((prev) => ({
      ...prev,
      previewLoaded: true,
      previewError: false,
    }));
  }

  function handleUrlError() {
    setUrlUpload((prev) => ({
      ...prev,
      previewLoaded: false,
      previewError: true,
      error: mediaCopy.urlFetchFailed[locale],
    }));
  }

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || images === null || uploading)
      return;
    setUploading(true);
    setProcessingNotice("");
    setNotice("");
    const files = Array.from(fileList);
    const nextSort =
      images.reduce((max, img) => Math.max(max, img.sort_order), -1) + 1;
    const batch: UploadItem[] = files.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      progress: 0,
      error: null,
      status: "queued",
    }));
    let uploadedCount = 0;
    setUploads((prev) => [...prev, ...batch]);

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const item = batch[i];
      try {
        setUploads((prev) =>
          prev.map((u) =>
            u.key === item.key ? { ...u, status: "uploading" } : u,
          ),
        );
        // Transfer progress is measurable; processing stages are a single server operation.
        const processingResult = await uploadFile(
          file,
          productId,
          nextSort + i,
          images.length === 0 && i === 0,
          (ratio) => {
            setUploads((prev) =>
              prev.map((u) =>
                u.key === item.key
                  ? {
                      ...u,
                      progress: ratio,
                      status: ratio >= 1 ? "processing" : "uploading",
                    }
                  : u,
              ),
            );
          },
          mediaCopy.uploadUncertain[locale],
        );

        uploadedCount += 1;
        setUploads((prev) =>
          prev.map((u) =>
            u.key === item.key
              ? {
                  ...u,
                  status: processingResult.status,
                }
              : u,
          ),
        );
      } catch (err) {
        setUploads((prev) =>
          prev.map((u) =>
            u.key === item.key
              ? {
                  ...u,
                  status: "failed",
                  error:
                    err instanceof Error
                      ? err.message
                      : mediaCopy.uploadFailed[locale],
                }
              : u,
          ),
        );
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadImages();
    if (uploadedCount > 0) announceSaved();
    setUploading(false);
  }

  async function patchImage(
    id: string,
    patch: Record<string, unknown>,
    failureNotice: string,
  ) {
    setBusyId(id);
    setNotice("");
    try {
      const response = await fetch("/api/management/product-images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setNotice(body.error || failureNotice);
        // Log storage-related failures for observability
        if (
          body.error?.includes("storage") ||
          body.error?.includes("cleanup")
        ) {
          console.warn(
            "[MediaGallery] Storage issue during patch:",
            body.error,
          );
        }
        return false;
      }
      await loadImages();
      announceSaved();
      return true;
    } catch (err) {
      setNotice(failureNotice);
      console.error("[MediaGallery] Patch error:", err);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const mediaBusy =
    uploading ||
    urlUpload.loading ||
    busyId !== null ||
    removingId !== null ||
    restoringId !== null ||
    batchProgress !== null ||
    deleting ||
    altSaving;
  const mutationsDisabled = mediaBusy || needsRefresh;

  async function processImages(targets: ProductImage[], all = false) {
    if (mutationsDisabled || imageOperationRef.current || !targets.length)
      return;
    imageOperationRef.current = true;
    setNotice("");
    setProcessingNotice("");
    setSavedNotice(false);
    setImageResults((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(
          ([id]) => !targets.some((image) => image.id === id),
        ),
      ),
    );
    let processed = 0;
    let transparent = 0;
    let failed = 0;
    let stopped = false;
    if (all) setBatchProgress({ completed: 0, total: targets.length });
    try {
      for (const image of targets) {
        setRemovingId(image.id);
        let message: string;
        let failure = false;
        try {
          const response = await fetch(
            "/api/management/product-images/remove-background",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: image.id }),
            },
          );
          const body = (await response.json()) as {
            image?: ProductImage;
            background_removal?: BackgroundRemovalInfo;
            code?: string;
          };
          if (!response.ok) {
            failure = true;
            failed++;
            message =
              body.code === "background_removal_unsupported"
                ? mediaCopy.removalUnsupported[locale]
                : body.code === "background_removal_unavailable"
                  ? mediaCopy.removalUnavailable[locale]
                  : response.status === 409
                    ? mediaCopy.removalConflict[locale]
                    : mediaCopy.removalFailed[locale];
            if (
              body.code === "image_write_uncertain" ||
              (response.status >= 500 &&
                body.code !== "background_removal_unavailable")
            ) {
              message = mediaCopy.imageWriteUncertain[locale];
              setNeedsRefresh(true);
              stopped = true;
            } else if (
              response.status === 409 ||
              response.status === 401 ||
              response.status === 403
            ) {
              stopped = true;
            }
          } else {
            const status = body.background_removal?.status;
            if (
              body.image?.id !== image.id ||
              !["processed", "transparent"].includes(status ?? "")
            )
              throw new Error("Unconfirmed image processing");
            if (status === "processed") processed++;
            else transparent++;
            message = getStatusLabel(status!, locale);
          }
        } catch {
          failure = true;
          failed++;
          stopped = true;
          setNeedsRefresh(true);
          message = mediaCopy.imageWriteUncertain[locale];
        }
        setImageResults((previous) => ({
          ...previous,
          [image.id]: { message, error: failure },
        }));
        if (!all) {
          if (failure) setNotice(message);
          else setProcessingNotice(message);
        }
        if (all)
          setBatchProgress({
            completed: processed + transparent + failed,
            total: targets.length,
          });
        if (stopped) break;
      }
      await loadImages();
      if (processed > 0) announceSaved();
      if (all) {
        const remaining = targets.length - processed - transparent - failed;
        setProcessingNotice(
          he
            ? `הוסרו רקעים: ${processed}. כבר שקופות: ${transparent}. נכשלו: ${failed}. לא עובדו: ${remaining}.`
            : `Backgrounds removed: ${processed}. Already transparent: ${transparent}. Failed: ${failed}. Not processed: ${remaining}.`,
        );
        if (stopped) setNotice(mediaCopy.imageWriteUncertain[locale]);
      }
    } finally {
      setRemovingId(null);
      setBatchProgress(null);
      imageOperationRef.current = false;
    }
  }

  async function restoreOriginal(image: ProductImage) {
    if (mutationsDisabled || imageOperationRef.current) return;
    imageOperationRef.current = true;
    setRestoringId(image.id);
    setNotice("");
    setProcessingNotice("");
    setSavedNotice(false);
    try {
      const response = await fetch(
        "/api/management/product-images/restore-original",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: image.id, image_url: image.image_url }),
        },
      );
      const body = (await response.json()) as {
        image?: ProductImage;
        code?: string;
      };
      if (!response.ok) {
        if (body.code === "image_write_uncertain")
          throw new Error("Unconfirmed restore");
        setNotice(
          response.status === 410
            ? mediaCopy.originalUnavailable[locale]
            : response.status === 409
              ? mediaCopy.removalConflict[locale]
              : mediaCopy.restoreFailed[locale],
        );
        return;
      }
      if (
        body.image?.id !== image.id ||
        body.image.image_url !== image.original_image_url
      )
        throw new Error("Unconfirmed restore");
      setImageResults((previous) => ({
        ...previous,
        [image.id]: {
          message: mediaCopy.originalRestored[locale],
          error: false,
        },
      }));
      setProcessingNotice(mediaCopy.originalRestored[locale]);
      announceSaved();
    } catch {
      setNeedsRefresh(true);
      setNotice(mediaCopy.imageWriteUncertain[locale]);
    } finally {
      await loadImages();
      setRestoringId(null);
      imageOperationRef.current = false;
    }
  }

  async function moveImage(index: number, direction: -1 | 1) {
    if (images === null) return;
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const reordered = [...images];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setImages(reordered);
    const first = reordered[target];
    const second = reordered[index];
    const okFirst = await patchImage(
      first.id,
      { sort_order: target },
      mediaCopy.imageOperationFailed[locale],
    );
    if (!okFirst) {
      // Revert on failure
      setImages(images);
      return;
    }
    const okSecond = await patchImage(
      second.id,
      { sort_order: index },
      mediaCopy.imageOperationFailed[locale],
    );
    if (!okSecond) {
      // Revert on failure
      setImages(images);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/management/product-images?id=${pendingDelete.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        // On failure, keep item visible and show specific error
        setNotice(body.error || mediaCopy.imageOperationFailed[locale]);
        // Log storage cleanup failures for observability (non-blocking)
        if (
          body.error?.includes("storage") ||
          body.error?.includes("cleanup")
        ) {
          console.warn(
            "[MediaGallery] Storage cleanup issue during delete:",
            body.error,
          );
        }
        return;
      }
      setPendingDelete(null);
      await loadImages();
      announceSaved();
    } catch (err) {
      setNotice(mediaCopy.imageOperationFailed[locale]);
      console.error("[MediaGallery] Delete error:", err);
    } finally {
      setDeleting(false);
    }
  }

  function openAltEdit(image: ProductImage) {
    setAltEdit(image);
    setAltHe(image.alt_he ?? "");
    setAltEn(image.alt_en ?? "");
    setAltError("");
  }

  async function saveAlt() {
    if (!altEdit) return;
    setAltSaving(true);
    setAltError("");
    try {
      const response = await fetch("/api/management/product-images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: altEdit.id,
          alt_he: altHe || null,
          alt_en: altEn || null,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setAltError(body.error || mediaCopy.imageOperationFailed[locale]);
        return;
      }
      setAltEdit(null);
      await loadImages();
      announceSaved();
    } catch (err) {
      setAltError(mediaCopy.imageOperationFailed[locale]);
      console.error("[MediaGallery] Save alt error:", err);
    } finally {
      setAltSaving(false);
    }
  }

  if (images === null && !error) {
    return (
      <div aria-busy="true" data-route-loading="true">
        <span className="sr-only" role="status">
          {he ? "טוען תמונות…" : "Loading images…"}
        </span>
        <div className={styles.galleryGrid} aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div className={styles.imageTile} key={index}>
              <div className={styles.imageFrame}>
                <Skeleton
                  width="full"
                  height="100%"
                  style={{ position: "absolute", inset: 0 }}
                />
              </div>
              <div className={styles.tileBody}>
                <Skeleton width="lg" />
                <Skeleton width="full" height="2rem" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sectionStack}>
      {error ? (
        <Notice
          tone="danger"
          onDismiss={() => setError("")}
          dismissLabel={editorCopy.dismiss[locale]}
        >
          {error}
        </Notice>
      ) : null}
      {notice ? (
        <Notice
          tone="danger"
          onDismiss={() => setNotice("")}
          dismissLabel={editorCopy.dismiss[locale]}
        >
          {notice}
        </Notice>
      ) : null}
      {processingNotice ? (
        <div className={styles.statusNote} role="status">
          {processingNotice}
        </div>
      ) : null}
      {savedNotice ? (
        <div className={styles.mediaSaved} role="status" aria-live="polite">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          <span>{mediaCopy.autoSaved[locale]}</span>
        </div>
      ) : null}

      <div className={styles.uploadActions}>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif,image/svg+xml"
          multiple
          disabled={mutationsDisabled}
          className={styles.fileInput}
          onChange={(e) => void handleFilesSelected(e.target.files)}
        />
        <label
          htmlFor={fileInputId}
          className="miro-button miro-button-secondary inline-flex items-center gap-2 cursor-pointer"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {mediaCopy.uploadLabel[locale]}
        </label>
        <button
          type="button"
          className="miro-button miro-button-secondary inline-flex items-center gap-2 cursor-pointer"
          onClick={openUrlUpload}
          disabled={mutationsDisabled}
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {mediaCopy.addByUrlLabel[locale]}
        </button>
        <p className={styles.statusNote} role="note">
          {mediaCopy.uploadHint[locale]}
        </p>
      </div>
      <div className={styles.uploadActions}>
        <button
          type="button"
          className="miro-button miro-button-secondary inline-flex items-center gap-2"
          onClick={() => void processImages(images ?? [], true)}
          disabled={mutationsDisabled || !images?.length}
          aria-busy={batchProgress !== null || undefined}
        >
          {batchProgress ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Eraser className="h-4 w-4" aria-hidden="true" />
          )}
          {mediaCopy.removeAllBackgrounds[locale]}
        </button>
        {batchProgress ? (
          <span role="status">
            {mediaCopy.removingBackground[locale]} {batchProgress.completed}/
            {batchProgress.total}
          </span>
        ) : null}
        {needsRefresh ? (
          <button
            type="button"
            className="miro-button miro-button-secondary"
            onClick={() => window.location.reload()}
          >
            {he ? "רענון הגלריה" : "Refresh gallery"}
          </button>
        ) : null}
      </div>
      <p className={styles.statusNote}>{mediaCopy.removalScope[locale]}</p>

      {uploads.length > 0 ? (
        <ul className={styles.uploadList}>
          {uploads.map((upload) => (
            <li key={upload.key} className={styles.uploadRow}>
              <span
                className={`${styles.uploadName} ${styles.ltrText}`}
                dir="ltr"
              >
                {upload.name}
              </span>
              {upload.status === "failed" || upload.error ? (
                <span className={styles.uploadError} role="alert">
                  {mediaCopy.uploadFailed[locale]}: {upload.error ?? ""}
                </span>
              ) : ["processed", "transparent", "original"].includes(
                  upload.status,
                ) ? (
                <span className={styles.uploadStatusCompleted} role="status">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {getStatusLabel(upload.status, locale)}
                </span>
              ) : (
                <>
                  <span
                    className={styles.uploadProgress}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={
                      upload.status === "uploading"
                        ? Math.round(upload.progress * 100)
                        : undefined
                    }
                    aria-label={`${getStatusLabel(upload.status, locale)} ${upload.name}`}
                  >
                    <span
                      className={styles.uploadProgressFill}
                      style={{ inlineSize: `${upload.progress * 100}%` }}
                    />
                  </span>
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className={styles.uploadStatusText}>
                    {getStatusLabel(upload.status, locale)}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {images !== null && images.length === 0 ? (
        <EmptyState
          icon={<ImageIcon size={20} />}
          title={mediaCopy.empty[locale]}
          description={mediaCopy.emptyDescription[locale]}
          compact
        />
      ) : null}

      {images !== null && images.length > 0 ? (
        <ul className={styles.galleryGrid} aria-label={mediaCopy.title[locale]}>
          {images.map((image, index) => {
            const isPrimary = index === 0;
            const altText = he
              ? (image.alt_he ?? image.alt_en ?? "")
              : (image.alt_en ?? image.alt_he ?? "");
            return (
              <li
                key={image.id}
                className={`${styles.imageTile} ${isPrimary ? styles.imageTilePrimary : ""}`}
              >
                <div className={styles.imageFrame}>
                  {isPrimary ? (
                    <span className={styles.primaryBadge}>
                      {mediaCopy.primary[locale]}
                    </span>
                  ) : null}
                  <Image
                    src={image.image_url}
                    alt={altText}
                    fill
                    className="object-contain"
                    sizes="(max-width: 640px) 50vw, 176px"
                    unoptimized={image.image_url.endsWith(".svg")}
                  />
                </div>
                <div className={styles.tileBody}>
                  <button
                    type="button"
                    className={`miro-button miro-button-secondary ${styles.removeBackgroundButton}`}
                    onClick={() => void processImages([image])}
                    disabled={mutationsDisabled}
                    aria-busy={removingId === image.id || undefined}
                  >
                    {removingId === image.id ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Eraser className="h-4 w-4" aria-hidden="true" />
                    )}
                    {removingId === image.id
                      ? mediaCopy.removingBackground[locale]
                      : mediaCopy.removeExistingBackground[locale]}
                  </button>
                  {image.original_image_url &&
                  image.original_image_url !== image.image_url ? (
                    <button
                      type="button"
                      className={`miro-button ${styles.removeBackgroundButton} ${styles.restoreOriginalButton}`}
                      onClick={() => void restoreOriginal(image)}
                      disabled={mutationsDisabled}
                      aria-busy={restoringId === image.id || undefined}
                    >
                      {restoringId === image.id ? (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Undo2 className="h-4 w-4" aria-hidden="true" />
                      )}
                      {restoringId === image.id
                        ? mediaCopy.restoringOriginal[locale]
                        : mediaCopy.restoreOriginal[locale]}
                    </button>
                  ) : null}
                  {imageResults[image.id] ? (
                    <p
                      className={styles.imageResult}
                      data-error={imageResults[image.id].error}
                      role="status"
                    >
                      {imageResults[image.id].message}
                    </p>
                  ) : null}
                  <p
                    className={`${styles.statusNote} truncate`}
                    dir="auto"
                    aria-hidden="true"
                  >
                    {altText || "—"}
                  </p>
                  <div className={styles.tileActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => void moveImage(index, -1)}
                      disabled={index === 0 || mutationsDisabled}
                      aria-label={mediaCopy.moveUp[locale]}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => void moveImage(index, 1)}
                      disabled={
                        index === images.length - 1 || mutationsDisabled
                      }
                      aria-label={mediaCopy.moveDown[locale]}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() =>
                        void patchImage(
                          image.id,
                          { is_primary: true },
                          mediaCopy.imageOperationFailed[locale],
                        )
                      }
                      disabled={isPrimary || mutationsDisabled}
                      aria-label={mediaCopy.setPrimary[locale]}
                      title={mediaCopy.setPrimary[locale]}
                    >
                      <Star className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => openAltEdit(image)}
                      disabled={mutationsDisabled}
                      aria-label={mediaCopy.editAlt[locale]}
                      title={mediaCopy.editAlt[locale]}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                      onClick={() => setPendingDelete(image)}
                      disabled={mutationsDisabled}
                      aria-label={mediaCopy.deleteImage[locale]}
                      title={mediaCopy.deleteImage[locale]}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Dialog
        open={altEdit !== null}
        onClose={() => {
          if (!altSaving) setAltEdit(null);
        }}
        title={mediaCopy.altDialogTitle[locale]}
        size="md"
        closeLabel={editorCopy.close[locale]}
        footer={
          <>
            <button
              type="button"
              className="miro-button miro-button-secondary"
              onClick={() => setAltEdit(null)}
              disabled={altSaving}
            >
              {editorCopy.cancel[locale]}
            </button>
            <button
              type="button"
              className="miro-button miro-button-primary"
              onClick={() => void saveAlt()}
              disabled={altSaving}
              aria-busy={altSaving || undefined}
            >
              {altSaving
                ? editorCopy.saving[locale]
                : mediaCopy.saveAlt[locale]}
            </button>
          </>
        }
      >
        <div className={styles.sectionStack}>
          {altError ? <Notice tone="danger">{altError}</Notice> : null}
          <FormField id="image-alt-he" label={mediaCopy.altHe[locale]}>
            {(control) => (
              <input
                {...control}
                type="text"
                className="miro-input"
                dir="rtl"
                value={altHe}
                maxLength={300}
                onChange={(e) => setAltHe(e.target.value)}
                disabled={altSaving}
              />
            )}
          </FormField>
          <FormField id="image-alt-en" label={mediaCopy.altEn[locale]}>
            {(control) => (
              <input
                {...control}
                type="text"
                className="miro-input"
                dir="ltr"
                value={altEn}
                maxLength={300}
                onChange={(e) => setAltEn(e.target.value)}
                disabled={altSaving}
              />
            )}
          </FormField>
        </div>
      </Dialog>

      <Dialog
        open={urlUploadOpen}
        onClose={closeUrlUpload}
        title={mediaCopy.urlDialogTitle[locale]}
        size="md"
        closeLabel={editorCopy.close[locale]}
        footer={
          <>
            <button
              type="button"
              className="miro-button miro-button-secondary"
              onClick={closeUrlUpload}
              disabled={urlUpload.loading}
            >
              {editorCopy.cancel[locale]}
            </button>
            <button
              type="button"
              className="miro-button miro-button-primary"
              onClick={() => void addImageByUrl()}
              disabled={urlUpload.loading}
              aria-busy={urlUpload.loading || undefined}
            >
              {urlUpload.loading
                ? mediaCopy.adding[locale]
                : mediaCopy.addButton[locale]}
            </button>
          </>
        }
      >
        <div className={styles.sectionStack}>
          {urlUpload.error ? (
            <Notice tone="danger">{urlUpload.error}</Notice>
          ) : null}
          <FormField
            id="image-url"
            label={mediaCopy.urlLabel[locale]}
            description={mediaCopy.urlHint[locale]}
            required
          >
            {(control) => (
              <input
                {...control}
                type="url"
                className={`miro-input ${styles.ltrText}`}
                dir="ltr"
                value={urlUpload.url}
                placeholder={mediaCopy.urlPlaceholder[locale]}
                maxLength={2000}
                onChange={(e) => handleUrlChange(e.target.value)}
                disabled={urlUpload.loading}
                aria-invalid={urlUpload.previewError || undefined}
              />
            )}
          </FormField>
          {validateUrl(urlUpload.url) === null && !urlUpload.previewError && (
            <div className={styles.urlPreview}>
              <Image
                src={urlUpload.url}
                alt={mediaCopy.previewAlt[locale]}
                width={200}
                height={150}
                className={styles.previewImage}
                unoptimized
                referrerPolicy="no-referrer"
                onLoad={handleUrlLoad}
                onError={handleUrlError}
              />
            </div>
          )}
          {urlUpload.previewError && (
            <p className={`${styles.statusNote} text-destructive`} role="alert">
              {mediaCopy.urlFetchFailed[locale]}
            </p>
          )}
          <FormField id="image-url-alt-he" label={mediaCopy.altHe[locale]}>
            {(control) => (
              <input
                {...control}
                type="text"
                className="miro-input"
                dir="auto"
                value={urlUpload.altHe}
                maxLength={300}
                onChange={(e) =>
                  setUrlUpload((prev) => ({ ...prev, altHe: e.target.value }))
                }
                disabled={urlUpload.loading}
              />
            )}
          </FormField>
          <FormField id="image-url-alt-en" label={mediaCopy.altEn[locale]}>
            {(control) => (
              <input
                {...control}
                type="text"
                className="miro-input"
                dir="auto"
                value={urlUpload.altEn}
                maxLength={300}
                onChange={(e) =>
                  setUrlUpload((prev) => ({ ...prev, altEn: e.target.value }))
                }
                disabled={urlUpload.loading}
              />
            )}
          </FormField>
        </div>
      </Dialog>

      <ConfirmationDialog
        open={pendingDelete !== null}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) setPendingDelete(null);
        }}
        title={mediaCopy.deleteImageTitle[locale]}
        description={mediaCopy.deleteImageDescription[locale]}
        confirmLabel={mediaCopy.deleteImage[locale]}
        cancelLabel={editorCopy.cancel[locale]}
        tone="danger"
        busy={deleting}
        closeLabel={editorCopy.close[locale]}
      />
    </div>
  );
}

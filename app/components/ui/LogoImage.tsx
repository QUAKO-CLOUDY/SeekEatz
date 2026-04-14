"use client";

import { useState } from "react";
import Image, { type ImageLoader, type ImageProps } from "next/image";

const passthroughLoader: ImageLoader = ({ src }) => src;

type LogoImageProps = Omit<ImageProps, "src" | "alt" | "loader" | "onError"> & {
  src: string;
  alt: string;
  fallbackSrc?: string;
  hideOnFallbackError?: boolean;
};

export function LogoImage({
  src,
  alt,
  fallbackSrc = "/logos/default.png",
  hideOnFallbackError = false,
  ...props
}: LogoImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [isHidden, setIsHidden] = useState(false);

  if (isHidden) {
    return null;
  }

  return (
    <Image
      {...props}
      loader={passthroughLoader}
      unoptimized
      src={currentSrc}
      alt={alt}
      onError={() => {
        if (currentSrc === fallbackSrc) {
          if (hideOnFallbackError) {
            setIsHidden(true);
          }
          return;
        }

        setCurrentSrc(fallbackSrc);
      }}
    />
  );
}

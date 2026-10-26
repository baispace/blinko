import { useState } from "react";
import { Image, ImageProps } from "@heroui/react";

const BRAND_FALLBACK = "/brand/mark.svg";

export const FallbackImage = ({ src, alt, className, ...props }: ImageProps) => {
    const [error, setError] = useState(false);
    const handleError = () => {
        setError(true);
    };

    if (error) {
        return <Image src={BRAND_FALLBACK} alt={alt} className={className} {...props} onError={handleError}  />;
    }

    return <Image src={src} alt={alt} className={className} {...props} onError={handleError} fallbackSrc={BRAND_FALLBACK} />;
}
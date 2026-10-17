type LogoProps = {
  /** Wordmark + icon lockup, or the square app icon only. */
  variant?: "full" | "mark";
  /** Use on dark backgrounds (footer, green surfaces). */
  dark?: boolean;
  height?: number;
  className?: string;
  label?: string;
};

/**
 * Real Azar Neɣ brand assets live in /public/brand (exported from docs/).
 * The wordmark already contains "Azar Neɣ", so no extra text is rendered.
 */
export function Logo({
  variant = "full",
  dark = false,
  height = 34,
  className,
  label = "Azar Neɣ",
}: LogoProps) {
  const src =
    variant === "mark" ? "/brand/icon.svg" : dark ? "/brand/logo-dark.svg" : "/brand/logo.svg";

  return (
    <img
      src={src}
      alt={label}
      height={height}
      className={className}
      style={{
        height,
        width: "auto",
        display: "block",
        // The dark lockup already ships white type; keep spacing tight in the shell.
        flex: "none",
      }}
      decoding="async"
    />
  );
}

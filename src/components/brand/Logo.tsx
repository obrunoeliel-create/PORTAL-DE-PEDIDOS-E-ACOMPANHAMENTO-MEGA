/* eslint-disable @next/next/no-img-element */

type Props = {
  size?: number;
  className?: string;
  /** Usa a versão grande (640px) — para telas de destaque. */
  large?: boolean;
};

/** Logo oficial da Mega Esfiha Jurema (mascote sobre fundo amarelo). */
export function Logo({ size = 56, className = "", large = false }: Props) {
  return (
    <img
      src={large ? "/brand/logo.jpg" : "/brand/logo-240.jpg"}
      alt="Mega Esfiha Jurema"
      width={size}
      height={size}
      className={`shrink-0 rounded-[28%] object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

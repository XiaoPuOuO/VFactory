interface OpenCodeLogoIconProps {
  className?: string;
}

/**
 * OpenCode 品牌圖示：依主題顯示 light/dark 版本，並限制尺寸避免在適配器卡片中錯位。
 */
export function OpenCodeLogoIcon({ className }: OpenCodeLogoIconProps) {
  return (
    <span className={className ? `opencode-logo-icon ${className}` : "opencode-logo-icon"}>
      <img
        src="/brands/opencode-logo-light-square.svg"
        alt=""
        aria-hidden
        className="dark:hidden"
      />
      <img
        src="/brands/opencode-logo-dark-square.svg"
        alt=""
        aria-hidden
        className="hidden dark:block"
      />
    </span>
  );
}

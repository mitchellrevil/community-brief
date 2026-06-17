const developmentFlag = String(import.meta.env.VITE_DEVELOPMENT ?? "").toLowerCase();

export const isDevelopmentBannerEnabled =
  developmentFlag === "true" ||
  developmentFlag === "1" ||
  developmentFlag === "yes" ||
  developmentFlag === "development";

export function DevelopmentServerBanner() {
  if (!isDevelopmentBannerEnabled) {
    return null;
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] h-8 overflow-hidden border-t border-zinc-700 bg-zinc-950 text-zinc-100 shadow-[0_-1px_4px_rgba(0,0,0,0.18)]"
      role="status"
    >
      <div className="development-banner-marquee flex h-full items-center whitespace-nowrap text-[13px] font-semibold uppercase tracking-normal">
        {Array.from({ length: 10 }, (_, index) => (
          <span className="px-10" key={index}>
            Development server
          </span>
        ))}
      </div>
    </div>
  );
}

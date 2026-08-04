export function installOverflowDiagnostics() {
  if (!import.meta.env.DEV || localStorage.getItem("mdn_debug_overflow") !== "1") return () => undefined;

  const inspect = () => {
    const offenders = Array.from(document.querySelectorAll<HTMLElement>(".dashboard-shell *"))
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({
        element,
        overflow: element.scrollWidth - element.clientWidth,
        className: element.className
      }));
    if (offenders.length) console.warn("[dashboard overflow]", offenders);
  };

  const observer = new ResizeObserver(inspect);
  observer.observe(document.documentElement);
  const timeout = window.setTimeout(inspect, 100);
  return () => {
    window.clearTimeout(timeout);
    observer.disconnect();
  };
}

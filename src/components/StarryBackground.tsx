export default function StarryBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 bg-[#06173a]"
      aria-hidden="true"
    >
      <iframe
        src={`${import.meta.env.BASE_URL}nen-dem-sao.html`}
        title="Nền đêm sao · Lumen Pelagi"
        className="h-full w-full border-0"
        tabIndex={-1}
        sandbox="allow-scripts"
      />
    </div>
  );
}

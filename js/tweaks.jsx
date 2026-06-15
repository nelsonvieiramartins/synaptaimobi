/* Synapta — Tweaks: acento, fonte de display, vinheta, scrubbing */
const SYN_TWEAKS = /*EDITMODE-BEGIN*/{
  "accent": "#C9A15C",
  "disp": "'Cormorant Garamond', Georgia, serif",
  "vignette": 0.62,
  "scrub": 0.14
}/*EDITMODE-END*/;

(function injectFonts() {
  if (document.getElementById('syn-tweak-fonts')) return;
  const l = document.createElement('link');
  l.id = 'syn-tweak-fonts';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=EB+Garamond:ital,wght@0,500;1,500&display=swap';
  document.head.appendChild(l);
})();

function hexToSoft(hex, a) {
  const m = hex.replace('#', '');
  const r = parseInt(m.substring(0, 2), 16);
  const g = parseInt(m.substring(2, 4), 16);
  const b = parseInt(m.substring(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function SynaptaTweaks() {
  const [t, setTweak] = useTweaks(SYN_TWEAKS);

  React.useEffect(function () {
    const root = document.documentElement;
    root.style.setProperty('--gold', t.accent);
    root.style.setProperty('--gold-soft', hexToSoft(t.accent, 0.16));
    root.style.setProperty('--disp', t.disp);
    root.style.setProperty('--vig', String(t.vignette));
    window.SYNAPTA = window.SYNAPTA || {};
    window.SYNAPTA.scrub = t.scrub;
  }, [t.accent, t.disp, t.vignette, t.scrub]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Acento" />
      <TweakColor label="Cor de acento" value={t.accent}
        options={['#C9A15C', '#D8B26A', '#B5894A', '#A9B0B8']}
        onChange={(v) => setTweak('accent', v)} />

      <TweakSection label="Tipografia" />
      <TweakSelect label="Fonte de display" value={t.disp}
        options={[
          { value: "'Cormorant Garamond', Georgia, serif", label: 'Cormorant Garamond' },
          { value: "'Playfair Display', Georgia, serif", label: 'Playfair Display' },
          { value: "'EB Garamond', Georgia, serif", label: 'EB Garamond' }
        ]}
        onChange={(v) => setTweak('disp', v)} />

      <TweakSection label="Cinema" />
      <TweakSlider label="Vinheta" value={t.vignette} min={0.3} max={0.85} step={0.01}
        onChange={(v) => setTweak('vignette', v)} />
      <TweakSlider label="Velocidade do scrubbing" value={t.scrub} min={0.05} max={0.45} step={0.01}
        onChange={(v) => setTweak('scrub', v)} />
    </TweaksPanel>
  );
}

(function mount() {
  const el = document.getElementById('tweaks-root');
  if (!el || !window.ReactDOM) return;
  ReactDOM.createRoot(el).render(<SynaptaTweaks />);
})();

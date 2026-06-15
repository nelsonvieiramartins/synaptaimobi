/* ============================================================
   SYNAPTA — Motor de scroll-driven narrative
   - calcula progresso 0..1 por cena, seta --p em cada .stage
   - controla opacidade/parallax das "paradas" (.beat)
   - acende janelas (Cena 5) e móveis (Cena 8) progressivamente
   - HUD, barra de progresso, persistência de posição
   - canvas frame-scrub: captura frames → ImageBitmap → zero seek
   ============================================================ */
(function () {
  'use strict';

  var SCROLL_KEY = 'synapta-scroll-v1';
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.SYNAPTA = window.SYNAPTA || {};
  window.SYNAPTA.scrub = window.SYNAPTA.scrub == null ? 0.14 : window.SYNAPTA.scrub;

  var chapters = [].slice.call(document.querySelectorAll('.chapter'));
  var stages   = chapters.map(function (c) { return c.querySelector('.stage'); });
  var beatsByStage = stages.map(function (s) { return [].slice.call(s.querySelectorAll('.beat')); });

  var vh = window.innerHeight;
  var docMetrics = [];

  function measure() {
    vh = window.innerHeight;
    docMetrics = chapters.map(function (c) {
      var top = c.offsetTop;
      var h   = c.offsetHeight;
      return { top: top, h: h, travel: Math.max(1, h - vh) };
    });
  }

  function smoothstep(a, b, x) {
    if (b === a) return x < a ? 0 : 1;
    var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }


  /* ================================================================
     BUILDERS — constroem DOM dinâmico para cenas especiais
     ================================================================ */

  /* Cena 5 — janelas que acendem conforme --p (se #s5-winds existir no HTML) */
  var windSpans = null;
  (function buildWindows() {
    var host = document.getElementById('s5-winds');
    if (!host) return;
    var cols = 6, rows = 11, n = cols * rows;
    var order = [];
    for (var i = 0; i < n; i++) order.push(i);
    var seed = 7;
    for (var j = order.length - 1; j > 0; j--) {
      seed = (seed * 9301 + 49297) % 233280;
      var k = Math.floor((seed / 233280) * (j + 1));
      var tmp = order[j]; order[j] = order[k]; order[k] = tmp;
    }
    var lightAt = new Array(n);
    for (var p = 0; p < n; p++) {
      lightAt[order[p]] = 0.18 + (p / n) * 0.78;
    }
    for (var w = 0; w < n; w++) {
      var el = document.createElement('span');
      el.className = 'w';
      el.dataset.at = lightAt[w].toFixed(3);
      host.appendChild(el);
    }
    windSpans = [].slice.call(host.querySelectorAll('.w'));
  })();

  /* Cena 5 — portfólio (grade de peças com filtros) */
  (function buildPortfolio() {
    var grid = document.getElementById('pf-grid');
    if (!grid) return;
    var items = [
      { cat: 'emp',    t: 'Lançamento Vertical'  },
      { cat: 'social', t: 'Reels 9:16'           },
      { cat: 'ads',    t: 'Anúncio Performance'  },
      { cat: 'emp',    t: 'Tour de Fachada'      },
      { cat: 'social', t: 'Stories Decorado'     },
      { cat: 'ads',    t: 'Vídeo Patrocinado'    },
      { cat: 'emp',    t: 'Planta Humanizada'    },
      { cat: 'social', t: 'Carrossel Áreas'      }
    ];
    items.forEach(function (it, i) {
      var card = document.createElement('div');
      card.className = 'pf-card';
      card.dataset.cat = it.cat;
      card.style.cssText = 'position:relative;aspect-ratio:9/16;border:1px solid var(--line);border-radius:3px;overflow:hidden;background:rgba(255,255,255,.02);';
      card.innerHTML =
        '<image-slot id="pf-' + i + '" style="position:absolute;inset:0;width:100%;height:100%" shape="rect" fit="cover" placeholder="Arraste sua peça 9:16"></image-slot>' +
        '<div style="position:absolute;left:0;right:0;bottom:0;padding:12px;pointer-events:none;background:linear-gradient(transparent,rgba(0,0,0,.82));z-index:2">' +
        '<div style="font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold)">' + catLabel(it.cat) + '</div>' +
        '<div style="font-family:var(--disp);font-weight:600;font-size:16px;color:#FAFAF7;line-height:1.05;margin-top:3px">' + it.t + '</div></div>';
      grid.appendChild(card);
    });

    function catLabel(c) {
      return c === 'ads' ? 'Anúncio' : c === 'social' ? 'Social' : 'Empreendimento';
    }

    var filters = document.getElementById('pf-filters');
    if (filters) {
      filters.addEventListener('click', function (e) {
        var pill = e.target.closest('.pill'); if (!pill) return;
        [].forEach.call(filters.children, function (p) { p.classList.remove('gold'); });
        pill.classList.add('gold');
        var cat = pill.dataset.cat;
        [].forEach.call(grid.children, function (card) {
          card.style.display = (cat === 'all' || card.dataset.cat === cat) ? '' : 'none';
        });
      });
    }
  })();

  /* Cena 1 — blocos de cidade em perspectiva (se .s1 .blocks existir no HTML) */
  (function buildBlocks() {
    var host = document.querySelector('.s1 .blocks');
    if (!host) return;
    var defs = [
      [5,4,6,7],   [14,2,9,5],  [26,6,7,8],  [34,8,8,5],
      [8,17,8,6],  [20,13,6,9], [33,19,7,5],
      [5,27,9,6],  [18,25,7,7],
      [7,37,6,8],  [22,32,8,5],
      [4,62,8,6],  [15,66,7,8], [28,72,9,5],
      [6,78,7,6],  [20,80,8,5], [33,84,7,7],
      [64,4,8,6],  [75,2,7,8],  [86,6,9,5],
      [67,15,6,9], [79,13,8,6], [91,11,6,7],
      [65,27,9,5], [77,25,7,8], [89,23,8,6],
      [69,37,6,7], [81,33,8,5],
      [63,62,8,7], [75,66,7,6], [87,68,9,7],
      [66,78,8,5], [79,80,7,7], [90,75,8,5],
      [36,85,8,6], [45,88,7,6], [54,86,8,7], [62,83,7,7]
    ];
    defs.forEach(function (d) {
      var el = document.createElement('div');
      el.className = 'blk';
      el.style.cssText = 'left:' + d[0] + '%;top:' + d[1] + '%;width:' + d[2] + '%;height:' + d[3] + '%;';
      host.appendChild(el);
    });
  })();

  /* Cena 8 — cache dos móveis para o render loop */
  var furnEls = [].slice.call(document.querySelectorAll('.s8 .furn'));


  /* ================================================================
     HUD — pontos laterais de navegação
     ================================================================ */
  var hud = document.getElementById('hud');
  chapters.forEach(function (c, i) {
    var tick = document.createElement('div');
    tick.className = 'tick'; tick.dataset.i = i;
    tick.innerHTML = '<span class="nm">' + (c.dataset.name || ('Cena ' + (i + 1))) + '</span><span class="dot"></span>';
    tick.addEventListener('click', function () {
      var top = docMetrics[i] ? docMetrics[i].top : c.offsetTop;
      window.scrollTo({ top: top + 4, behavior: 'smooth' });
    });
    hud.appendChild(tick);
  });
  var ticks = [].slice.call(hud.children);

  var bar  = document.getElementById('progress');
  var hint = document.getElementById('scrollhint');


  /* ================================================================
     RENDER LOOP — motor principal (60 fps via rAF)
     ================================================================ */
  var smooth     = window.scrollY;
  var target     = window.scrollY;
  var prevSmooth = smooth;

  function applyBeats(beats, p, active) {
    for (var i = 0; i < beats.length; i++) {
      var b    = beats[i];
      var din  = parseFloat(b.dataset.in  || '0');
      var dout = parseFloat(b.dataset.out || '1');
      var op = 0, shift = 0;
      if (active) {
        var span = Math.max(0.0001, dout - din);
        var lt   = (p - din) / span;
        if (lt >= -0.25 && lt <= 1.25) {
          var fade  = 0.18;
          var inOp  = smoothstep(0, fade, lt);
          var outOp = 1 - smoothstep(1 - fade, 1, lt);
          op    = Math.min(inOp, outOp);
          shift = (lt - 0.5) * (prefersReduced ? 0 : -26);
        }
      }
      b.style.opacity      = op.toFixed(3);
      b.style.transform    = 'translateY(' + shift.toFixed(1) + 'px)';
      b.style.pointerEvents = op > 0.6 ? 'auto' : 'none';
    }
  }

  function render() {
    var k = prefersReduced ? 1 : (window.SYNAPTA.scrub || 0.14);
    smooth += (target - smooth) * k;
    if (Math.abs(target - smooth) < 0.4) smooth = target;
    var scrollDelta = smooth - prevSmooth;
    prevSmooth = smooth;

    var maxScroll = document.documentElement.scrollHeight - vh;
    if (bar) bar.style.width = (clamp01(smooth / Math.max(1, maxScroll)) * 100).toFixed(2) + '%';

    var activeIdx = 0, bestDist = Infinity;

    for (var i = 0; i < chapters.length; i++) {
      var m = docMetrics[i]; if (!m) continue;
      var p     = clamp01((smooth - m.top) / m.travel);
      var stage = stages[i];
      var active = smooth >= m.top - vh * 0.5 && smooth <= m.top + m.h;

      stage.style.setProperty('--p', p.toFixed(4));
      applyBeats(beatsByStage[i], p, smooth >= m.top - 2 && smooth <= m.top + m.travel + 2);

      var center = m.top + m.travel * 0.5;
      var d = Math.abs(smooth - center);
      if (smooth >= m.top - vh * 0.5 && smooth <= m.top + m.h - vh * 0.5 && d < bestDist) {
        bestDist = d; activeIdx = i;
      }

      /* ---- vídeo: canvas frame-scrub ou fallback ---- */
      var video    = stage.querySelector('video.bg-video');
      var scrubber = scrubbers[i];

      if (scrubber && scrubber.busy) {
        /* captura a 8× em curso — não tocar no vídeo */
      } else if (scrubber) {
        if (!scrubber.drawAt(p)) {
          /* canvas não pronto ainda → playbackRate como ponte */
          if (video && !isNaN(video.duration) && video.duration > 0) {
            var idealTime = clamp01(p) * video.duration;
            var drift     = idealTime - video.currentTime;
            var now       = performance.now();
            if (!video._st) video._st = 0;
            if (Math.abs(drift) > 1.5 && now - video._st > 150) {
              video.currentTime = idealTime; video._st = now;
            } else if (scrollDelta > 0.3) {
              var rate = scrollDelta * (video.duration / Math.max(1, m.travel)) * 60;
              video.playbackRate = Math.min(4, Math.max(0.25, rate));
              if (video.paused) video.play().catch(function () {});
            } else if (scrollDelta < -0.3) {
              if (!video.paused) video.pause();
              if (now - video._st > 50) { video.currentTime = idealTime; video._st = now; }
            } else {
              if (!video.paused) video.pause();
            }
          }
        }
      } else if (video) {
        /* browser sem requestVideoFrameCallback → play/pause por cena activa */
        if (active) {
          if (video.paused) video.play().catch(function () {});
        } else {
          if (!video.paused) video.pause();
        }
      }

      /* ---- Cena 5: janelas acendem conforme p ---- */
      if (windSpans && i === 4) {
        for (var w = 0; w < windSpans.length; w++) {
          windSpans[w].classList.toggle('lit', p >= parseFloat(windSpans[w].dataset.at));
        }
      }

      /* ---- Cena 8: móveis revelados conforme p ---- */
      if (furnEls.length && i === 7) {
        for (var f = 0; f < furnEls.length; f++) {
          var threshold = parseFloat(furnEls[f].dataset.at || '0');
          furnEls[f].classList.toggle('in', p >= threshold);
        }
      }
    }

    for (var t = 0; t < ticks.length; t++) ticks[t].classList.toggle('on', t === activeIdx);
    if (hint) hint.style.opacity = smooth > vh * 0.4 ? '0' : '0.85';

    requestAnimationFrame(render);
  }


  /* ================================================================
     EVENTOS — scroll, resize, persistência
     ================================================================ */
  function onScroll() { target = window.scrollY; saveSoon(); }

  var saveT = null;
  function saveSoon() {
    if (saveT) return;
    saveT = setTimeout(function () {
      saveT = null;
      try { localStorage.setItem(SCROLL_KEY, String(window.scrollY)); } catch (e) {}
    }, 200);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { measure(); target = window.scrollY; });

  function restore() {
    measure();
    var v = null;
    try { v = localStorage.getItem(SCROLL_KEY); } catch (e) {}
    if (v != null && !location.hash) {
      var y = parseFloat(v);
      if (!isNaN(y) && y > 0) { window.scrollTo(0, y); smooth = target = y; }
    }
  }


  /* ================================================================
     FRAME-SCRUB — captura frames em ImageBitmap via rVFC
     Por quê: MP4 H.264 seek = decodifica desde o keyframe anterior.
     Aqui rodamos o vídeo a 8× no carregamento, capturamos cada frame
     em ImageBitmap (GPU), e no scroll desenhamos com busca binária:
     zero seek, zero decode, fluido em qualquer direção.
     ================================================================ */
  var scrubbers = stages.map(function () { return null; });

  /* onTick(pct 0-100, label) — chamado a cada mudança de estado
     onFirstReady()         — chamado quando a 1ª cena (visível) está pronta
     onAllDone()            — chamado quando TODAS as cenas estão prontas */
  function initScrubbers(onTick, onFirstReady, onAllDone) {
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) {
      if (onFirstReady) onFirstReady();
      if (onAllDone)    onAllDone();
      return;
    }

    /* Conta apenas stages que têm vídeo */
    var totalScenes = stages.filter(function (s) {
      return s && s.querySelector('video.bg-video');
    }).length;
    var doneScenes      = 0;
    var firstReadyFired = false;

    /* Começa a captura da cena activa para o utilizador ver resultado primeiro */
    var activeIdx = 0, bestDist = Infinity;
    for (var j = 0; j < chapters.length; j++) {
      var mj = docMetrics[j];
      if (!mj) continue;
      var dj = Math.abs(smooth - (mj.top + mj.travel * 0.5));
      if (dj < bestDist) { bestDist = dj; activeIdx = j; }
    }
    var queue = [];
    for (var q = 0; q < stages.length; q++) {
      queue.push((activeIdx + q) % stages.length);
    }

    function captureNext() {
      if (!queue.length) { if (onAllDone) onAllDone(); return; }
      var sceneNum = doneScenes + 1;
      if (onTick) onTick(
        Math.round(doneScenes / totalScenes * 100),
        'Cena ' + sceneNum + ' de ' + totalScenes + '…'
      );
      var i      = queue.shift();
      var stage  = stages[i];
      var video  = stage && stage.querySelector('video.bg-video');
      if (!video) { captureNext(); return; }

      /* canvas de exibição — cobre o <video>, z-index acima dele */
      var canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;opacity:0;transition:opacity .5s;';
      var fp = stage.querySelector('.filmplate');
      if (!fp) { captureNext(); return; }
      fp.appendChild(canvas);
      var ctx = canvas.getContext('2d', { alpha: false });

      /* canvas auxiliar para extrair frames na resolução nativa do vídeo */
      var src    = document.createElement('canvas');
      var srcCtx = src.getContext('2d', { alpha: false });

      var frames = [];   /* [{ t, bmp }] ordenado por t */
      var ready  = false;
      var STEP   = 1 / 10;     /* captura a 10 fps — suficiente para fluídez */
      var self;

      /* replica object-fit:cover — preserva aspect ratio, recorta ao centro */
      function drawCover(bitmap) {
        var cw = canvas.width, ch = canvas.height;
        var bw = bitmap.width, bh = bitmap.height;
        var scale = Math.max(cw / bw, ch / bh);
        var dw = bw * scale, dh = bh * scale;
        ctx.drawImage(bitmap, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      }

      function syncCanvasSize() {
        canvas.width  = stage.offsetWidth  || window.innerWidth;
        canvas.height = stage.offsetHeight || window.innerHeight;
      }

      function startCapture() {
        src.width  = video.videoWidth  || 1920;
        src.height = video.videoHeight || 1080;
        syncCanvasSize();
        window.addEventListener('resize', syncCanvasSize);

        video.pause();
        video.currentTime = 0;
        video.playbackRate = 16; /* 16× → captura ~2× mais rápido */
        var prevT = -1;

        function tick(_, meta) {
          var t = (meta && meta.mediaTime != null) ? meta.mediaTime : video.currentTime;
          if (t - prevT >= STEP - 0.001) {
            var entry = { t: t, bmp: null };
            frames.push(entry);
            srcCtx.drawImage(video, 0, 0, src.width, src.height);
            createImageBitmap(src).then(function (b) { entry.bmp = b; });
            prevT = t;
          }
          if (t < video.duration - 0.05) {
            video.requestVideoFrameCallback(tick);
          } else {
            finish();
          }
        }

        video.requestVideoFrameCallback(tick);
        video.play().catch(function () {});
      }

      function finish() {
        video.pause();
        video.currentTime = 0;
        video.playbackRate = 1;
        var poll = setInterval(function () {
          if (frames.every(function (f) { return f.bmp; })) {
            clearInterval(poll);
            ready = true;
            self.busy = false;
            canvas.style.opacity = '1';
            doneScenes++;

            /* 1ª cena pronta → libera loader para o utilizador interagir */
            if (!firstReadyFired) {
              firstReadyFired = true;
              if (onFirstReady) onFirstReady();
            }

            if (onTick) onTick(
              Math.round(doneScenes / totalScenes * 100),
              doneScenes < totalScenes
                ? doneScenes + ' de ' + totalScenes + ' prontas'
                : 'Pronto!'
            );
            captureNext();
          }
        }, 50);
      }

      /* busy: true enquanto captura, impede o render loop de interferir */
      self = scrubbers[i] = {
        busy: true,
        drawAt: function (p) {
          if (!ready || !frames.length) return false;
          var tgt = p * frames[frames.length - 1].t;
          /* busca binária O(log n) */
          var lo = 0, hi = frames.length - 1;
          while (lo < hi) {
            var mid = (lo + hi + 1) >> 1;
            if (frames[mid].t <= tgt) lo = mid; else hi = mid - 1;
          }
          if (frames[lo].bmp) drawCover(frames[lo].bmp);
          return true;
        }
      };

      if (video.readyState >= 1) startCapture();
      else video.addEventListener('loadedmetadata', startCapture, { once: true });
    }

    captureNext();
  }


  /* ================================================================
     LOADER — controlador da tela de carregamento
     Retorna { tick(pct, label), dismiss() } para ser usado pelo boot.
     Mantém o scroll bloqueado até dismiss() ser chamado.
     Fallback de 90 s para never-ending captures.
     ================================================================ */
  var loaderCtrl = null;

  function initLoader() {
    var overlay = document.getElementById('pageloader');
    var fill    = document.getElementById('pl-fill');
    var status  = document.getElementById('pl-status');

    /* sem overlay no DOM → retorna no-op (não quebra nada) */
    if (!overlay) return { tick: function () {}, dismiss: function () {} };

    var gone     = false;
    var fallback = setTimeout(function () { ctrl.dismiss(); }, 90000);

    function _dismiss() {
      if (gone) return;
      gone = true;
      document.body.classList.remove('loading');
      overlay.classList.add('pl-out');
      setTimeout(function () { if (overlay.parentNode) overlay.remove(); }, 900);
    }

    var ctrl = {
      tick: function (pct, label) {
        if (fill)   fill.style.width = Math.min(100, pct) + '%';
        if (status) status.textContent = label;
      },
      dismiss: function () {
        clearTimeout(fallback);
        setTimeout(_dismiss, 500); /* pausa breve antes de revelar */
      }
    };

    if (status) status.textContent = 'Iniciando…';
    return ctrl;
  }

  /* ================================================================
     BOOT — sequência de arranque
     Ordem: restore → measure → initScrubbers (com callbacks do loader)
     O loader só é dispensado quando TODOS os canvas frames estiverem
     prontos, garantindo que o scroll já controla o vídeo ao revelar.
     ================================================================ */
  function boot() {
    restore();
    measure();
    initScrubbers(
      function (pct, label) { if (loaderCtrl) loaderCtrl.tick(pct, label); },
      function ()            { if (loaderCtrl) loaderCtrl.dismiss(); }, /* 1ª cena → fecha loader */
      null /* onAllDone: captura restantes em background silencioso */
    );
  }

  loaderCtrl = initLoader(); /* mostra overlay imediatamente */

  if (document.readyState === 'complete') {
    boot();
  } else {
    window.addEventListener('load', boot);
  }

  /* re-measure após fontes e layout estabilizarem */
  document.addEventListener('DOMContentLoaded', measure);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { measure(); });
  }
  setTimeout(measure, 400);
  setTimeout(measure, 1200);

  measure();
  smooth = target = window.scrollY;
  requestAnimationFrame(render);

})();

(() => {
  'use strict';

  function mount({ card, canvas, onOpen }) {
    const cover = document.createElement('div');
    cover.className = 'flower-cover';

    const seal = document.createElement('span');
    seal.className = 'flower-cover-seal';
    seal.setAttribute('aria-hidden', 'true');
    seal.innerHTML = '<svg viewBox="0 0 80 56" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><rect x="7.5" y="7.5" width="65" height="41" rx="3"/><path d="M8 10l32 23 32-23M8 46l24-19m40 19L48 27"/><circle cx="40" cy="32" r="6.5" fill="currentColor"/></svg>';

    const note = document.createElement('p');
    note.className = 'flower-cover-note';
    note.id = 'flower-cover-note';
    note.textContent = 'A little something, just for you.';

    const opener = document.createElement('button');
    opener.type = 'button';
    opener.className = 'flower-cover-open';
    opener.textContent = 'Open your flowers';
    opener.setAttribute('aria-describedby', note.id);
    cover.append(seal, note, opener);

    // Leave the stage itself and live link/error notices alone. Keep the sealed
    // content in layout so the card doesn't jump when its cover lifts.
    const content = [
      canvas,
      ...card.querySelectorAll('.card-topline, #growth-status, .registration, .side-note, .stage-controls, .card-bottomline, #save-status'),
      ...document.querySelectorAll('.garden-controls, #share-status, #manual-share, #botanical-note'),
    ];
    const newlyInert = content.filter(element => !element.hasAttribute('inert'));
    const active = document.activeElement;
    let sealed = true;
    let pointerId;

    for (const element of content) element.setAttribute('data-flower-sealed', '');
    for (const element of newlyInert) element.setAttribute('inert', '');
    card.prepend(cover);
    if (active === document.body || content.some(element => element.contains(active))) opener.focus({ preventScroll: true });

    function uncover() {
      if (!sealed) return;
      sealed = false;
      for (const element of content) element.removeAttribute('data-flower-sealed');
      for (const element of newlyInert) element.removeAttribute('inert');
    }

    function dismiss() {
      const hadFocus = cover.contains(document.activeElement);
      cover.remove();
      uncover();
      return hadFocus;
    }

    // Press on pointer down, commit on the native click (also supports Enter,
    // Space and assistive technology without adding our own key handling).
    opener.addEventListener('pointerdown', event => {
      if (event.button !== 0 || pointerId !== undefined) return;
      pointerId = event.pointerId;
      opener.setAttribute('data-pressed', '');
    });
    const release = event => {
      if (event.pointerId !== pointerId) return;
      pointerId = undefined;
      opener.removeAttribute('data-pressed');
    };
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) opener.addEventListener(type, release);
    opener.addEventListener('click', event => {
      if (!sealed) return;
      const instant = event.detail === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      uncover();
      canvas.focus({ preventScroll: true });
      if (instant) {
        cover.remove();
      } else {
        cover.setAttribute('inert', '');
        cover.setAttribute('aria-hidden', 'true');
        cover.setAttribute('data-open', '');
        // This only removes the decoration. Neither input nor bloom waits on
        // the transition. Cancellations (including motion changes) clean up too.
        const transitions = cover.getAnimations?.() ?? [];
        if (transitions.length) Promise.allSettled(transitions.map(transition => transition.finished)).then(() => cover.remove());
        else cover.remove();
      }
      onOpen({ instant });
    });

    return { get sealed() { return sealed; }, dismiss };
  }

  window.FlowerReveal = { mount };
})();

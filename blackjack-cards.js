/* Original, self-contained playing-card artwork. No external images or fonts. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BlackjackCards = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
  const SUITS = Object.freeze({ '♠': '黑桃', '♥': '红桃', '♦': '方块', '♣': '梅花' });
  const INK = '#192c36', RED = '#ba293b', GOLD = '#c49a43', BLUE = '#23455f';
  let serial = 0;

  // Deliberately inspect only the public face supplied by the caller. In particular,
  // privateFace is neither a fallback nor an input to card artwork or accessibility.
  function faceOf(card) {
    if (!card || typeof card !== 'object' || card.hidden === true) return null;
    const rank = card.rank, suit = card.suit;
    return typeof rank === 'string' && RANKS.includes(rank) &&
      typeof suit === 'string' && Object.prototype.hasOwnProperty.call(SUITS, suit) ? { rank, suit } : null;
  }

  // All rank paths are drawn here, so the indices are legible without a font load.
  const GLYPHS = Object.freeze({
    A: 'M1 25 8.5 1 16 25M4 17H13M0 25H5M12 25H17',
    '2': 'M1 6C1-1 16-1 16 7C16 12 9 15 2 23L1 25H17V21',
    '3': 'M1 4C5-1 16 0 16 6C16 10 12 12 8 12C20 11 20 25 9 25C5 25 2 24 0 21',
    '4': 'M12 25V0L0 18H17M8 25H17',
    '5': 'M16 1H2L1 12C8 8 17 11 17 18C17 26 5 28 0 22',
    '6': 'M15 2C3-4-3 15 3 23C9 29 18 23 16 16C14 9 5 10 1 15',
    '7': 'M0 1H17L5 25M0 1V5M1 25H9',
    '8': 'M8.5 12C-4 8 1-1 9 1C19-1 21 9 8.5 12C-5 16 0 26 9 25C19 26 22 15 8.5 12Z',
    '9': 'M2 23C14 29 20 10 14 2C8-4-1 2 1 9C3 16 12 15 16 10',
    '10': 'M0 5 4 1V25M0 25H8M15 4C15 0 25 0 25 4V22C25 26 15 26 15 22Z',
    J: 'M3 1H17M12 1V18C12 28 0 28 0 20',
    Q: 'M1 7C1-2 17-2 17 7V18C17 27 1 27 1 18ZM10 18 19 27',
    K: 'M0 1H7M3 1V25M0 25H7M17 1H12M15 1 3 15M8 10 17 25M13 25H19'
  });

  function glyph(rank, x, y, width, height) {
    const sourceWidth = rank === '10' ? 26 : rank === 'Q' || rank === 'K' ? 20 : 18;
    return '<g class="bj-art-rank" transform="translate(' + x + ' ' + y + ') scale(' +
      (width / sourceWidth) + ' ' + (height / 27) + ')" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="square" stroke-linejoin="round"><path d="' + GLYPHS[rank] + '"/></g>';
  }

  function suitShape(suit) {
    switch (suit) {
      case '♠': return '<path d="M0-18C-4-12-16-6-16 3C-16 11-5 14-1 6C-1 13-4 16-8 18H8C4 16 1 13 1 6C5 14 16 11 16 3C16-6 4-12 0-18Z"/>';
      case '♥': return '<path d="M0 16C-5 11-17 2-17-7C-17-17-4-21 0-10C4-21 17-17 17-7C17 2 5 11 0 16Z"/>';
      case '♦': return '<path d="M0-19 13 0 0 19-13 0Z"/>';
      case '♣': return '<path d="M-1 7C-3 13-5 16-9 18H9C5 16 3 13 1 7Z"/><circle cy="-10" r="8.5"/><circle cx="-8.5" cy="2" r="8.5"/><circle cx="8.5" cy="2" r="8.5"/>';
      default: return '';
    }
  }

  function pip(suit, x, y, size, inverted, className) {
    return '<g class="' + (className || 'bj-art-pip') + '" transform="translate(' + x + ' ' + y + ') ' +
      (inverted ? 'rotate(180) ' : '') + 'scale(' + size / 36 + ')" fill="currentColor">' + suitShape(suit) + '</g>';
  }

  function corner(face) {
    const index = glyph(face.rank, face.rank === '10' ? 10 : 12, 13, face.rank === '10' ? 27 : 22, 30) +
      pip(face.suit, 23, 59, 20, false, 'bj-art-index-suit');
    return '<g class="bj-art-corner">' + index + '</g><g class="bj-art-corner" transform="rotate(180 100 140)">' + index + '</g>';
  }

  // Familiar deck layouts: outer columns, centre additions, and a rotated lower half.
  function numberPips(face) {
    const rank = Number(face.rank), spots = [];
    const add = (x, y) => spots.push([x, y]);
    const pair = y => { add(64, y); add(136, y); };
    if (rank === 2 || rank === 3) {
      add(100, 66); if (rank === 3) add(100, 140); add(100, 214);
    } else if (rank === 4 || rank === 5) {
      pair(64); if (rank === 5) add(100, 140); pair(216);
    } else if (rank >= 6 && rank <= 8) {
      pair(62); pair(140); pair(218);
      if (rank === 7) add(100, 101);
      if (rank === 8) { add(100, 101); add(100, 179); }
    } else {
      pair(58); pair(112); pair(168); pair(222);
      if (rank === 9) add(100, 140);
      if (rank === 10) { add(100, 85); add(100, 195); }
    }
    const size = rank >= 9 ? 29 : 33;
    return '<g class="bj-art-pips" data-pip-count="' + rank + '">' + spots.map(([x, y]) => pip(face.suit, x, y, size, y > 140)).join('') + '</g>';
  }

  function ace(face) {
    const flourish = '<path d="M64 181Q100 199 136 181M70 188Q100 202 130 188M84 198H116" fill="none" stroke="currentColor" stroke-width=".8" opacity=".45"/><path d="m100 202 3 4-3 4-3-4Z" fill="currentColor" opacity=".65"/>';
    return '<g class="bj-art-ace">' + pip(face.suit, 100, 130, face.suit === '♠' ? 104 : 94, false, 'bj-art-ace-suit') + flourish + '</g>';
  }

  function robe(rank, accent) {
    const sash = rank === 'Q' ? '<path d="M72 110 132 140H149L89 105Z" fill="' + GOLD + '"/><path d="m78 111 57 28" stroke="#fff0c3" stroke-width="1.5"/>' :
      '<path d="M65 113 112 140H136L83 106Z" fill="' + accent + '"/><path d="m70 113 45 26M79 110 50 133" stroke="' + GOLD + '" stroke-width="2"/>';
    return '<path d="M50 140 54 119Q62 110 86 104H114Q139 110 146 121L151 140Z" fill="' + BLUE + '" stroke="' + INK + '" stroke-width="1.1"/>' +
      '<path d="m52 126 19-16 12 30H50Zm76-17 19 15 4 16h-27Z" fill="' + accent + '" stroke="' + INK + '" stroke-width="1"/>' +
      '<path d="m57 126 8 8 8-9M127 117l10 8-8 9M87 112l13 26 14-26" fill="none" stroke="' + GOLD + '" stroke-width="2.5"/>' +
      '<path d="m90 103 10 10 10-10 5 8-15 10-15-10Z" fill="#f8edc8" stroke="' + INK + '" stroke-width="1"/>' + sash +
      '<g fill="' + GOLD + '"><path d="m57 137 3-4 3 4-3 3Zm79-1 3-4 3 4-3 3Zm-22-8 3-4 3 4-3 3Z"/><circle cx="100" cy="126" r="1.6"/><circle cx="105" cy="135" r="1.6"/></g>';
  }

  function faceDetails(isQueen) {
    return '<path d="M91 75Q99 70 110 75L113 89 110 102Q103 109 94 101L89 91Z" fill="#f3d4a5" stroke="' + INK + '" stroke-width="1.2"/>' +
      '<path d="m98 89 2 6h-3M95 98q6 3 10-1" fill="none" stroke="' + (isQueen ? RED : '#805b45') + '" stroke-width="1.1" stroke-linecap="round"/>' +
      '<path d="m92 84 5-1m6 0 5 1" stroke="' + INK + '" fill="none" stroke-width="1"/><circle cx="95" cy="86" r="1.2" fill="' + INK + '"/><circle cx="106" cy="86" r="1.2" fill="' + INK + '"/>' +
      '<path d="M89 86Q84 83 87 92L91 93M112 86Q117 83 114 92L111 94" fill="#f3d4a5" stroke="' + INK + '" stroke-width="1"/>';
  }

  function jack(accent) {
    return robe('J', accent) +
      '<path d="m61 79-3 44 5 3 3-47-3-10Z" fill="#eee6cf" stroke="' + INK + '" stroke-width="1"/><path d="m57 123 12 1m-8 2-1 11" stroke="' + GOLD + '" stroke-width="3"/>' +
      '<path d="M58 126q4-5 8-1l-1 9-7-1Z" fill="#f3d4a5" stroke="' + INK + '"/>' +
      '<path d="M86 91 85 74Q91 64 107 70L116 80 114 103 109 105 108 89Z" fill="' + INK + '"/>' + faceDetails(false) +
      '<path d="M83 78 87 59Q103 55 119 68L121 76Z" fill="' + accent + '" stroke="' + INK + '" stroke-width="1.4"/>' +
      '<path d="M84 73Q100 67 121 74L119 80Q100 74 84 80Z" fill="' + GOLD + '" stroke="' + INK + '"/>' +
      '<path d="M113 67Q112 49 130 48Q124 61 113 67Z" fill="#f5eacb" stroke="' + INK + '"/><path d="m113 68 13-16" stroke="' + GOLD + '"/>' +
      '<path d="m110 96 5 3-3 6-5-3" fill="' + INK + '"/><path d="m92 101 4 3" stroke="' + INK + '" stroke-width="1.2"/>';
  }

  function queen(accent) {
    return robe('Q', accent) +
      '<path d="M84 77Q78 88 83 109L94 114 94 90 108 90 110 112 120 106Q125 84 116 73Z" fill="#a96832" stroke="' + INK + '" stroke-width="1.1"/>' +
      '<path d="m85 91 3 17m27-18-2 18" stroke="' + GOLD + '" stroke-width="2.6"/>' + faceDetails(true) +
      '<path d="M86 78Q99 66 115 78L116 71 109 61 101 68 93 60 86 70Z" fill="' + GOLD + '" stroke="' + INK + '" stroke-width="1.1"/>' +
      '<path d="m86 68 1-11 8 7 6-13 6 13 9-7-1 14Z" fill="' + GOLD + '" stroke="' + INK + '" stroke-width="1.1"/>' +
      '<path d="M87 73H115" stroke="#f9ebbc" stroke-width="2"/><path d="m101 60 3 5-3 4-3-4Z" fill="' + accent + '"/>' +
      '<circle cx="89" cy="96" r="2.1" fill="' + GOLD + '"/><circle cx="113" cy="96" r="2.1" fill="' + GOLD + '"/>' +
      '<path d="M135 86 131 129m3-25 8-7m-9 15-7-8" fill="none" stroke="#557655" stroke-width="2"/>' +
      '<path d="M135 88Q124 88 129 80Q124 72 133 73Q137 65 141 74Q151 75 144 83Q147 92 138 89Z" fill="' + accent + '" stroke="' + INK + '" stroke-width="1"/><circle cx="137" cy="80" r="3.4" fill="' + GOLD + '"/>' +
      '<path d="M128 123q5-4 9 0l-1 10-9-1Z" fill="#f3d4a5" stroke="' + INK + '"/>';
  }

  function king(accent) {
    return robe('K', accent) +
      '<path d="M62 79V135" stroke="' + INK + '" stroke-width="4.2"/><path d="M62 79V135" stroke="' + GOLD + '" stroke-width="2.4"/><path d="m55 70 7-9 7 9-7 12Z" fill="' + GOLD + '" stroke="' + INK + '"/><path d="m57 70 5 4 5-4M62 61V55m-3 3h6" fill="none" stroke="' + INK + '" stroke-width="1"/>' +
      '<path d="M58 125q4-4 8 0l1 10-9-1Z" fill="#f3d4a5" stroke="' + INK + '"/>' +
      '<path d="M85 79Q86 67 101 66Q116 67 118 82L115 104 109 112 90 107 84 93Z" fill="' + INK + '"/>' + faceDetails(false) +
      '<path d="M90 94 94 99 100 96 107 99 113 94 111 105 101 116 92 106Z" fill="#b58a4b" stroke="' + INK + '" stroke-width="1"/>' +
      '<path d="m94 101 7 9 7-9M100 100v10" fill="none" stroke="' + INK + '" stroke-width=".8"/>' +
      '<path d="m85 76-2-18 10 7 7-15 8 15 11-7-3 18Z" fill="' + GOLD + '" stroke="' + INK + '" stroke-width="1.3"/>' +
      '<path d="M85 74H116V80H85Z" fill="' + GOLD + '" stroke="' + INK + '"/><path d="m100 59 4 6-4 5-4-5Z" fill="' + accent + '"/><circle cx="90" cy="69" r="2" fill="' + BLUE + '"/><circle cx="111" cy="69" r="2" fill="' + BLUE + '"/><path d="M87 77H114" stroke="#fff0c3"/>';
  }

  function court(face) {
    const accent = face.suit === '♥' || face.suit === '♦' ? '#bd3441' : '#a9313b';
    const portrait = face.rank === 'J' ? jack(accent) : face.rank === 'Q' ? queen(accent) : king(accent);
    const suitMark = pip(face.suit, 54, 56, 16, false, 'bj-art-court-suit');
    return '<g class="bj-art-court" data-court="' + face.rank + '"><rect x="43" y="43" width="114" height="194" rx="1.5" fill="#f1e6c7" stroke="' + INK + '" stroke-width="1.2"/>' +
      '<path d="M46 139V46H154V139ZM46 141V234H154V141Z" fill="#f8efd4" stroke="' + GOLD + '" stroke-width=".8"/>' +
      '<g class="bj-art-court-half">' + suitMark + portrait + '</g><g class="bj-art-court-half" transform="rotate(180 100 140)">' + suitMark + portrait + '</g>' +
      '<path d="M46 137 154 142V145L46 140Z" fill="' + GOLD + '" stroke="' + INK + '" stroke-width=".65"/>' +
      '<path d="m49 47 5 4 5-4m82 186 5-4 5 4" fill="none" stroke="' + GOLD + '" stroke-width="1"/></g>';
  }

  function paper(id) {
    return '<defs><linearGradient id="' + id + '-paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffef9"/><stop offset=".55" stop-color="#fdfaf0"/><stop offset="1" stop-color="#f1ecd9"/></linearGradient></defs>' +
      '<rect class="bj-art-paper" x=".65" y=".65" width="198.7" height="278.7" rx="11" fill="url(#' + id + '-paper)" stroke="#c9c2af" stroke-width="1.3"/>' +
      '<rect x="2.4" y="2.4" width="195.2" height="275.2" rx="9.4" fill="none" stroke="#fffdf7" stroke-width=".7"/>';
  }

  function back(id) {
    return '<defs><pattern id="' + id + '-weave" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#1f4058"/><path d="M-10 0 0-10 30 20 20 30ZM-10 20 20-10 30 0 0 30Z" fill="none" stroke="#e0bd8b" stroke-width=".6" opacity=".74"/><path d="m10 3 7 7-7 7-7-7Z" fill="#a43143" stroke="#e5c99d" stroke-width=".7"/><path d="m10 7 3 3-3 3-3-3Z" fill="#263e55"/></pattern></defs>' +
      '<g class="bj-art-back"><rect x="11" y="11" width="178" height="258" rx="5" fill="#1f4058" stroke="#1c364b" stroke-width="1"/><rect x="15" y="15" width="170" height="250" rx="3" fill="url(#' + id + '-weave)" stroke="#cdb28a" stroke-width="1"/>' +
      '<rect x="21" y="21" width="158" height="238" rx="1.5" fill="none" stroke="#f1dab0" stroke-width=".7"/>' +
      '<path d="m100 61 56 79-56 79-56-79Z" fill="#203c54" stroke="#edcfa1" stroke-width="2"/><path d="m100 71 48 69-48 69-48-69Z" fill="#a43143" stroke="#edcfa1" stroke-width=".9"/><path d="m100 81 40 59-40 59-40-59Z" fill="#203c54" stroke="#edcfa1" stroke-width="1"/>' +
      '<path d="m100 98 27 42-27 42-27-42Z" fill="none" stroke="#edcfa1" stroke-width="1"/><path d="m100 112 18 28-18 28-18-28Z" fill="#f0d6a5"/><path d="m100 122 11 18-11 18-11-18Z" fill="#a43143"/><circle cx="100" cy="140" r="4" fill="#f0d6a5"/>' +
      '<g fill="#f1d7a9"><path d="m100 37 4 6-4 6-4-6Zm0 194 4 6-4 6-4-6ZM30 134l4 6-4 6-4-6Zm140 0 4 6-4 6-4-6Z"/></g></g>';
  }

  function markup(face) {
    const id = 'bj-art-' + (++serial);
    const isRed = !!face && (face.suit === '♥' || face.suit === '♦');
    const art = face ? corner(face) + (face.rank === 'A' ? ace(face) : Number.isFinite(Number(face.rank)) ? numberPips(face) : court(face)) : back(id);
    return '<svg class="bj-card-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true" focusable="false" style="color:' + (isRed ? RED : INK) + '">' + paper(id) + art + '</svg>';
  }

  function svg(card) { return markup(faceOf(card)); }

  function render(card) {
    if (typeof document === 'undefined') throw new Error('BlackjackCards.render requires a DOM document. Use svg() outside the browser.');
    const face = faceOf(card), node = document.createElement('article');
    node.className = 'bj-card bj-illustrated-card' + (!face ? ' is-hidden' : face.suit === '♥' || face.suit === '♦' ? ' is-red' : '');
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', face ? SUITS[face.suit] + ' ' + face.rank : '暗牌，牌面未公开');
    node.setAttribute('data-card-face', face ? 'front' : 'back');
    // Only allowlisted paths, colors and validated rank/suit constants enter markup.
    node.innerHTML = markup(face);
    return node;
  }

  return Object.freeze({ render, svg });
});

"""Generates the hand-drawn rainbow lorikeet logo as lorikeet.svg (1024 x 1024, badge of radius 300)."""
import math
import random
import sys

R = random.Random(7)

HEAD = "M396,402 C414,366 450,338 500,322 C552,306 610,308 642,334 C668,356 676,392 668,430 C650,500 610,560 572,596 C520,590 470,575 440,540 C420,515 404,490 398,470 Z"
COLLAR = "M642,334 C694,362 716,430 706,494 C692,548 640,586 572,596 C606,560 650,500 668,430 C676,392 668,356 642,334 Z"
CHEST = "M440,540 C392,610 384,720 430,880 L644,880 C652,770 678,650 706,494 C692,548 640,586 572,596 C520,590 470,575 440,540 Z"
WING = "M706,466 C772,520 816,610 830,720 L846,880 L644,880 C652,770 678,650 706,494 Z"
BELLY = "M436,812 C520,790 600,798 652,818 L648,880 L452,880 Z"
BEAK_UP = "M400,400 C370,390 334,400 312,425 C294,446 290,474 299,496 C303,503 309,500 311,493 C317,471 331,459 351,457 C369,455 387,461 402,469 Z"
BEAK_LO = "M352,460 C346,472 350,488 362,494 C378,500 396,494 404,480 L402,469 Z"


def wobble(x, y, a=1.5):
    return x + R.uniform(-a, a), y + R.uniform(-a, a)


def strokes(n, box, angle, length, color, width, opacity, curve=0.25, jitter=12):
    """n short pencil strokes inside box, leaning at angle (degrees) with a slight bend."""
    x0, y0, x1, y1 = box
    out = []
    for _ in range(n):
        x, y = R.uniform(x0, x1), R.uniform(y0, y1)
        a = math.radians(angle + R.uniform(-jitter, jitter))
        L = length * R.uniform(0.6, 1.2)
        ex, ey = x + L * math.cos(a), y + L * math.sin(a)
        mx, my = (x + ex) / 2 - curve * L * math.sin(a), (y + ey) / 2 + curve * L * math.cos(a)
        out.append(
            f'<path d="M{x:.1f},{y:.1f} Q{mx:.1f},{my:.1f} {ex:.1f},{ey:.1f}" stroke="{color}" '
            f'stroke-width="{width * R.uniform(0.7, 1.2):.2f}" stroke-opacity="{opacity * R.uniform(0.6, 1):.2f}"/>'
        )
    return "\n".join(out)


def scallops(rows, color, width, opacity):
    """Rows of small feather arcs: (y, x_start, x_end, size)."""
    out = []
    for y, xs, xe, s in rows:
        x = xs + R.uniform(0, s / 2)
        while x < xe:
            yy = y + R.uniform(-3, 3)
            out.append(
                f'<path d="M{x:.1f},{yy:.1f} q{s / 2:.1f},{s * 0.55:.1f} {s:.1f},0" stroke="{color}" '
                f'stroke-width="{width}" stroke-opacity="{opacity * R.uniform(0.6, 1):.2f}"/>'
            )
            x += s * R.uniform(0.95, 1.15)
    return "\n".join(out)


def wing_feathers():
    """Overlapping covert rows, then long primaries trailing down."""
    out = []
    for i, (y, xs, xe, s) in enumerate([(560, 690, 800, 34), (610, 680, 815, 38), (665, 668, 826, 42), (722, 660, 834, 46)]):
        out.append(scallops([(y, xs, xe, s)], "#1c5f2a", 4, 0.8))
    for k in range(6):
        x = 690 + k * 26 + R.uniform(-4, 4)
        out.append(
            f'<path d="M{x:.1f},760 C{x + 6:.1f},810 {x + 10:.1f},850 {x + 12:.1f},900" stroke="#1c5f2a" '
            f'stroke-width="4" stroke-opacity="0.75"/>'
        )
    return "\n".join(out)


def outline(d, w):
    return f'<path d="{d}" stroke-width="{w}"/>'


svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <filter id="wob" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves="2" seed="4" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="7" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="crayon" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="8" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.8" result="a"/>
      <feComposite in="SourceGraphic" in2="a" operator="in" result="g"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="6" result="w"/>
      <feDisplacementMap in="g" in2="w" scale="10" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <linearGradient id="gHead" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3550c4"/><stop offset="0.6" stop-color="#2a3a9e"/><stop offset="1" stop-color="#3a2f8f"/>
    </linearGradient>
    <linearGradient id="gChest" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e8401f"/><stop offset="0.45" stop-color="#f26a22"/><stop offset="1" stop-color="#f7a92c"/>
    </linearGradient>
    <linearGradient id="gWing" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4fb04f"/><stop offset="1" stop-color="#257a35"/>
    </linearGradient>
    <linearGradient id="gCollar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9ccc3a"/><stop offset="1" stop-color="#e3df3c"/>
    </linearGradient>
    <clipPath id="disc"><circle cx="512" cy="512" r="300"/></clipPath>
    <clipPath id="cHead"><path d="{HEAD}"/></clipPath>
    <clipPath id="cCollar"><path d="{COLLAR}"/></clipPath>
    <clipPath id="cChest"><path d="{CHEST}"/></clipPath>
    <clipPath id="cWing"><path d="{WING}"/></clipPath>
  </defs>

  <circle cx="512" cy="512" r="300" fill="#f6f1e6"/>
  <g clip-path="url(#disc)">
    <g filter="url(#crayon)">
      <path d="{WING}" fill="url(#gWing)"/>
      <path d="{CHEST}" fill="url(#gChest)"/>
      <path d="{BELLY}" fill="#3e3a9c"/>
      <path d="{COLLAR}" fill="url(#gCollar)"/>
      <path d="{HEAD}" fill="url(#gHead)"/>
      <path d="{BEAK_LO}" fill="#a8261a"/>
      <path d="{BEAK_UP}" fill="#ee4a2c"/>
    </g>

    <g filter="url(#wob)" fill="none" stroke-linecap="round">
      <g clip-path="url(#cHead)">
        {strokes(90, (430, 300, 690, 600), 160, 36, "#b4c4ff", 3.2, 0.85)}
        {strokes(60, (420, 320, 690, 600), 165, 30, "#141a52", 3, 0.8)}
      </g>
      <g clip-path="url(#cCollar)">
        {strokes(55, (430, 320, 730, 620), 110, 26, "#6f9a1c", 2.4, 0.6)}
        {strokes(30, (430, 320, 730, 620), 110, 22, "#fff38a", 2.4, 0.6)}
      </g>
      <g clip-path="url(#cChest)">
        {scallops([(y, 410, 720, 30 + (y - 620) / 30) for y in range(628, 880, 30)], "#b8231a", 4, 0.75)}
        {scallops([(y + 9, 410, 720, 28) for y in range(640, 800, 60)], "#ffd75a", 3, 0.6)}
        {strokes(40, (420, 600, 700, 860), 95, 22, "#b8231a", 2, 0.4)}
      </g>
      <g clip-path="url(#cWing)">
        {wing_feathers()}
        {strokes(40, (650, 480, 840, 880), 70, 28, "#e9f59a", 2, 0.35)}
      </g>
      <path d="M394,405 C360,398 326,412 308,440" stroke="#ffffff" stroke-width="5" stroke-opacity="0.55"/>
      <path d="M402,469 C384,462 366,458 352,458" stroke="#7a1a10" stroke-width="3" stroke-opacity="0.8"/>
      <circle cx="386" cy="412" r="3.5" fill="#5a160d" stroke="none"/>
    </g>

    <g filter="url(#wob)" fill="none" stroke="#2b2724" stroke-linecap="round" stroke-linejoin="round">
      {outline("M398,470 C404,490 420,515 440,540", 5)}
      {outline("M440,540 C470,575 520,590 572,596", 2.5)}
      {outline("M400,400 C414,366 450,338 500,322 C552,306 610,308 642,334 C668,356 676,392 668,430", 6)}
      {outline(BEAK_UP, 5.5)}
      {outline(BEAK_LO, 5)}
      {outline("M642,334 C694,362 716,430 706,494", 4.5)}
      {outline("M440,540 C392,610 384,720 430,880", 5.5)}
      {outline("M706,466 C772,520 816,610 830,720 L846,880", 5.5)}
      {outline("M706,494 C690,600 660,720 648,880", 3.5)}
      <g stroke-width="2" stroke-opacity="0.45" transform="translate(3,-3)">
        {outline("M400,400 C414,366 450,338 500,322 C552,306 610,308 642,334", 2)}
        {outline("M440,540 C392,610 384,720 430,880", 2)}
        {outline("M706,466 C772,520 816,610 830,720", 2)}
      </g>
    </g>

    <circle cx="452" cy="384" r="17" fill="#1d1a17"/>
    <circle cx="452" cy="384" r="12.5" fill="#f2552a"/>
    <circle cx="453" cy="385" r="6" fill="#120f0c"/>
    <circle cx="448" cy="379" r="3" fill="#ffffff"/>
  </g>
  <g filter="url(#wob)" fill="none" stroke="#2b2724" stroke-linecap="round">
    <circle cx="512" cy="512" r="302" stroke-width="8"/>
    <circle cx="514" cy="509" r="313" stroke-width="3" stroke-opacity="0.4"/>
  </g>
</svg>
'''

open(sys.argv[1] if len(sys.argv) > 1 else "bird.svg", "w").write(svg)

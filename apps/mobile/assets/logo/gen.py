"""Hand-drawn rainbow lorikeet perched on a branch: realistic shapes, coloured in with scribbles. Writes lorikeet.svg."""
import math
import random
import sys

R = random.Random(11)

HEAD = "M384,372 C400,335 440,308 486,304 C530,300 566,318 582,352 C594,378 594,402 588,418 C560,450 510,470 470,478 C440,484 418,488 404,486 C394,470 388,455 386,440 Z"
COLLAR = "M574,336 C606,362 624,398 620,436 C598,462 562,482 522,494 L514,470 C548,456 576,440 588,418 C594,400 592,372 574,336 Z"
CHEST = "M402,470 C382,540 386,620 418,680 C444,726 484,752 528,754 C570,700 604,560 622,430 L560,420 Z"
BELLY = "M432,690 C462,736 520,770 596,792 C620,772 634,742 632,702 C570,716 498,712 432,690 Z"
WING = "M584,356 C660,396 722,478 752,580 C776,660 792,722 804,774 C762,780 700,772 642,752 C600,738 572,720 560,700 C592,600 612,500 600,420 Z"
TAIL = "M640,738 C716,760 792,782 836,826 L892,912 L796,930 C758,866 700,812 632,778 Z"
BEAK_UP = "M386,374 C360,366 332,376 318,398 C304,420 304,448 314,468 C318,475 323,472 323,465 C327,446 337,434 353,432 C367,430 381,434 391,442 Z"
BEAK_LO = "M352,434 C342,446 344,466 358,474 C374,480 390,470 396,454 L391,442 Z"
BRANCH = "M150,826 C330,812 520,800 700,774 C780,762 840,756 900,750 L900,786 C840,792 780,800 700,812 C520,838 330,852 150,862 Z"


def rot(u, v, a, cx, cy):
    c, s = math.cos(a), math.sin(a)
    return cx + u * c - v * s, cy + u * s + v * c


def scribble(box, angle, spacing, amp, color, width, opacity):
    """Back-and-forth pen scribble filling box, rows running at angle (degrees)."""
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    D = math.hypot(x1 - x0, y1 - y0) / 2
    a = math.radians(angle)
    out = []
    v = -D
    while v < D:
        pts, u, side = [], -D, 1
        while u < D:
            p = rot(u + R.uniform(-2, 2), v + side * amp * R.uniform(0.5, 1.25), a, cx, cy)
            pts.append(f"{p[0]:.1f},{p[1]:.1f}")
            u += amp * R.uniform(0.5, 1.0)
            side = -side
        out.append(
            f'<polyline points="{" ".join(pts)}" stroke="{color}" stroke-width="{width * R.uniform(0.8, 1.2):.2f}" '
            f'stroke-opacity="{opacity * R.uniform(0.75, 1):.2f}"/>'
        )
        v += spacing * R.uniform(0.8, 1.2)
    return "\n".join(out)


def flicks(n, box, angle, length, color, width, opacity, jitter=14):
    """Short bent pencil flicks, for feather texture."""
    x0, y0, x1, y1 = box
    out = []
    for _ in range(n):
        x, y = R.uniform(x0, x1), R.uniform(y0, y1)
        a = math.radians(angle + R.uniform(-jitter, jitter))
        L = length * R.uniform(0.6, 1.3)
        ex, ey = x + L * math.cos(a), y + L * math.sin(a)
        mx, my = (x + ex) / 2 - 0.2 * L * math.sin(a), (y + ey) / 2 + 0.2 * L * math.cos(a)
        out.append(
            f'<path d="M{x:.1f},{y:.1f} Q{mx:.1f},{my:.1f} {ex:.1f},{ey:.1f}" stroke="{color}" '
            f'stroke-width="{width * R.uniform(0.7, 1.2):.2f}" stroke-opacity="{opacity * R.uniform(0.6, 1):.2f}"/>'
        )
    return "\n".join(out)


def scallop_rows(rows, color, width, opacity):
    out = []
    for y0, xs, xe, s, tilt in rows:
        x = xs + R.uniform(0, s / 2)
        while x < xe:
            y = y0 + (x - xs) * tilt + R.uniform(-3, 3)
            out.append(
                f'<path d="M{x:.1f},{y:.1f} q{s / 2:.1f},{s * 0.6:.1f} {s:.1f},{R.uniform(-3, 3):.1f}" stroke="{color}" '
                f'stroke-width="{width * R.uniform(0.8, 1.2):.2f}" stroke-opacity="{opacity * R.uniform(0.6, 1):.2f}"/>'
            )
            x += s * R.uniform(0.9, 1.15)
    return "\n".join(out)


def sketch(d, width, passes=3):
    """The same line drawn a few times, slightly off and broken, like a quick pencil outline."""
    out = []
    for i in range(passes):
        dx, dy = R.uniform(-3.5, 3.5), R.uniform(-3.5, 3.5)
        w = width if i == 0 else width * R.uniform(0.35, 0.6)
        dash = "" if i == 0 else f' stroke-dasharray="{R.randint(60, 160)} {R.randint(6, 26)}"'
        op = 0.9 if i == 0 else R.uniform(0.35, 0.6)
        out.append(f'<path d="{d}" transform="translate({dx:.1f} {dy:.1f})" stroke-width="{w:.2f}" stroke-opacity="{op:.2f}"{dash}/>')
    return "\n".join(out)


def region(name, path, layers):
    return f'<g clip-path="url(#c{name})">\n{layers}\n</g>'


def fade(id_, x1, y1, x2, y2):
    return (
        f'<linearGradient id="g{id_}" gradientUnits="userSpaceOnUse" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
        f'<stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>'
        f'<mask id="m{id_}" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">'
        f'<rect width="1024" height="1024" fill="url(#g{id_})"/></mask>'
    )


clips = "\n".join(
    f'<clipPath id="c{n}"><path d="{p}"/></clipPath>'
    for n, p in [("Head", HEAD), ("Collar", COLLAR), ("Chest", CHEST), ("Belly", BELLY), ("Wing", WING), ("Tail", TAIL),
                 ("BeakUp", BEAK_UP), ("BeakLo", BEAK_LO), ("Branch", BRANCH)]
)

masks = "".join([
    fade("HeadDark", 600, 470, 440, 320),     # dark at the back and under the jaw
    fade("ChestTop", 0, 470, 0, 640),         # red at the top
    fade("ChestLow", 0, 760, 0, 600),         # yellow lower down
    fade("ChestShade", 640, 640, 470, 560),   # shade where the wing meets the chest
    fade("WingDark", 760, 760, 620, 470),     # wing darker towards the tip
    fade("WingLight", 590, 400, 700, 560),    # light on the shoulder
])

body = f'''
<!-- quick wash of colour under the scribbles -->
<g filter="url(#crayon)" opacity="0.5">
  <path d="{TAIL}" fill="#4caa4c"/>
  <path d="{CHEST}" fill="#f2752a"/>
  <path d="{BELLY}" fill="#4a3ca6"/>
  <path d="{WING}" fill="#42a447"/>
  <path d="{COLLAR}" fill="#cfe03c"/>
  <path d="{HEAD}" fill="#3a4cc2"/>
  <path d="{BEAK_UP}" fill="#ef5030"/>
  <path d="{BEAK_LO}" fill="#c43420"/>
</g>

<g fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#wob)">
  {region("Branch", BRANCH, scribble((150, 740, 900, 870), -4, 7, 6, "#7a5a3c", 2.2, 0.75) + flicks(40, (150, 750, 900, 860), -4, 40, "#3d2c1d", 2, 0.6, 4))}

  {region("Tail", TAIL,
    scribble((630, 730, 900, 930), 48, 8, 7, "#2f8e3c", 2.4, 0.8)
    + scribble((630, 730, 900, 930), 48, 16, 6, "#d6d93a", 2.2, 0.55)
    + flicks(14, (650, 760, 880, 920), 50, 70, "#1b5524", 2.4, 0.7, 4))}

  {region("Chest", CHEST,
    scribble((380, 420, 640, 760), 72, 7, 7, "#f08a2a", 2.4, 0.85)
    + f'<g mask="url(#mChestTop)">{scribble((380, 420, 640, 760), 20, 7, 7, "#dc2f1c", 2.6, 0.9)}</g>'
    + f'<g mask="url(#mChestLow)">{scribble((380, 420, 640, 760), -30, 8, 7, "#f8c63a", 2.4, 0.85)}</g>'
    + f'<g mask="url(#mChestShade)">{scribble((380, 420, 640, 760), 120, 8, 7, "#9e2216", 2.2, 0.75)}</g>'
    + scallop_rows([(y, 400, 620, 26, 0.12) for y in range(540, 720, 28)], "#a3221a", 3, 0.6))}

  {region("Belly", BELLY,
    scribble((430, 680, 640, 800), 15, 7, 7, "#3f2f9a", 2.4, 0.9)
    + scribble((430, 680, 640, 800), 105, 12, 6, "#1d1660", 2.2, 0.7))}

  {region("Wing", WING,
    scribble((560, 350, 810, 790), 62, 7, 7, "#2f9140", 2.4, 0.85)
    + f'<g mask="url(#mWingDark)">{scribble((560, 350, 810, 790), 118, 7, 7, "#16502a", 2.4, 0.9)}</g>'
    + f'<g mask="url(#mWingLight)">{scribble((560, 350, 810, 790), 20, 9, 6, "#a6dc5a", 2.2, 0.7)}</g>'
    + scallop_rows([(470, 600, 700, 34, 0.5), (520, 600, 730, 38, 0.5), (575, 596, 750, 42, 0.45), (632, 592, 770, 46, 0.4)], "#123f1f", 3, 0.55)
    + "".join(f'<path d="M{600 + k * 34:.0f},{690 + k * 6:.0f} C{650 + k * 34:.0f},{715 + k * 8:.0f} {720 + k * 20:.0f},{745 + k * 6:.0f} {800 + k * 6:.0f},{772 + k * 2:.0f}" stroke="#123f1f" stroke-width="3" stroke-opacity="0.7"/>' for k in range(5)))}

  {region("Collar", COLLAR,
    scribble((460, 330, 630, 510), 100, 7, 6, "#bcd52c", 2.2, 0.9)
    + scribble((460, 330, 630, 510), 30, 12, 6, "#f3ea4c", 2.2, 0.7)
    + flicks(20, (540, 360, 630, 500), 115, 24, "#6e8f1a", 2.2, 0.7))}

  {region("Head", HEAD,
    scribble((380, 296, 600, 492), 160, 6, 6, "#3445bc", 2.3, 0.9)
    + f'<g mask="url(#mHeadDark)">{scribble((380, 296, 600, 492), 110, 7, 6, "#151b5e", 2.4, 0.9)}</g>'
    + flicks(70, (420, 300, 590, 460), 170, 26, "#9cb2ff", 2.4, 0.75)
    + flicks(40, (400, 330, 590, 480), 175, 22, "#2a1d78", 2.4, 0.7))}

  {region("BeakUp", BEAK_UP,
    scribble((300, 360, 395, 476), 60, 5, 5, "#e8432a", 2, 0.9)
    + scribble((300, 360, 395, 476), 140, 9, 5, "#a92416", 2, 0.6)
    + '<path d="M378,378 C352,374 330,388 320,412" stroke="#ffd3c4" stroke-width="5" stroke-opacity="0.7"/>')}
  {region("BeakLo", BEAK_LO, scribble((340, 430, 400, 480), 30, 5, 4, "#8f1d12", 2, 0.9))}

  <!-- feet gripping the branch -->
  <g stroke="#6f6a66" stroke-width="5">
    <path d="M528,760 C530,776 524,792 512,800"/><path d="M536,762 C546,778 548,794 540,806"/>
    <path d="M574,756 C576,772 572,788 562,796"/><path d="M582,758 C594,772 596,790 588,802"/>
  </g>
</g>

<!-- pencil outlines -->
<g fill="none" stroke="#2a2622" stroke-linecap="round" stroke-linejoin="round" filter="url(#wob)">
  {sketch("M386,374 C400,335 440,308 486,304 C530,300 566,318 582,352 C600,384 622,404 640,432", 4)}
  {sketch(BEAK_UP, 3.6)}
  {sketch("M352,434 C342,446 344,466 358,474 C374,480 390,470 396,454", 3.4)}
  {sketch("M392,452 C394,470 398,478 402,486 C386,540 386,620 418,680 C444,726 484,752 528,754", 4)}
  {sketch("M640,432 C700,480 740,540 760,610 C780,680 792,730 804,774", 3.8)}
  {sketch("M560,700 C590,720 620,742 660,756 C720,774 770,778 804,774", 2.6, 2)}
  {sketch("M600,430 C612,520 596,620 560,700", 2.2, 2)}
  {sketch("M836,826 C800,790 740,770 660,748", 2.4, 2)}
  {sketch("M150,826 C330,812 520,800 700,774 C780,762 840,756 900,750", 3.2, 2)}
  {sketch("M150,862 C330,852 520,838 700,812 C780,800 840,792 900,786", 3.2, 2)}
</g>

<!-- eye -->
<circle cx="418" cy="362" r="13" fill="#1d1a17"/>
<circle cx="418" cy="362" r="9.5" fill="#f2552a"/>
<circle cx="419" cy="363" r="4.6" fill="#120f0c"/>
<circle cx="415" cy="358.5" r="2.4" fill="#fff"/>
<path d="M403,350 q15,-9 30,2" fill="none" stroke="#151b5e" stroke-width="3" stroke-linecap="round"/>
<circle cx="372" cy="384" r="3" fill="#5a160d"/>
'''

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <filter id="wob" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="4" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="5" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="crayon" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="8" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.8" result="a"/>
      <feComposite in="SourceGraphic" in2="a" operator="in"/>
    </filter>
    <clipPath id="disc"><circle cx="512" cy="512" r="300"/></clipPath>
    {clips}
    {masks}
  </defs>
  <circle cx="512" cy="512" r="300" fill="#f6f1e6"/>
  <g clip-path="url(#disc)">
    <g transform="translate(40 -30) translate(512 512) scale(0.88) translate(-512 -512)">{body}</g>
  </g>
  <g fill="none" stroke="#2a2622" stroke-linecap="round" filter="url(#wob)">
    <circle cx="512" cy="512" r="302" stroke-width="7"/>
    <circle cx="514" cy="509" r="311" stroke-width="2.5" stroke-opacity="0.4" stroke-dasharray="180 14"/>
  </g>
</svg>
'''

open(sys.argv[1] if len(sys.argv) > 1 else "lorikeet.svg", "w").write(svg)

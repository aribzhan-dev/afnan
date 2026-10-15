from pathlib import Path

out = Path(__file__).resolve().parents[1] / "public/products"
head = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 360"><defs><linearGradient id="body" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#ffffff"/><stop offset=".6" stop-color="#e7e9e7"/><stop offset="1" stop-color="#b5bbb9"/></linearGradient><linearGradient id="side"><stop stop-color="#919b9c"/><stop offset="1" stop-color="#c7cdcc"/></linearGradient><linearGradient id="black" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#434b50"/><stop offset="1" stop-color="#151b20"/></linearGradient><filter id="shadow" x="-50%" y="-30%" width="200%" height="180%"><feGaussianBlur stdDeviation="10"/></filter></defs><ellipse cx="225" cy="307" rx="110" ry="15" fill="#243241" opacity=".13" filter="url(#shadow)"/>"""


def save(name, body):
    (out / f"{name}.svg").write_text(head + body + "</svg>")


def breaker(w=92, brand="Schneider", switch="#3e7667", double=False):
    x = 220 - w / 2
    s = f'<g transform="rotate(-9 220 180)"><path d="M{x} 74 l28 -20 h{w} v226 l-28 20z" fill="url(#side)"/><rect x="{x}" y="74" width="{w}" height="226" rx="6" fill="url(#body)" stroke="#aeb8b9"/><path d="M{x} 74 l28 -20 h{w} l-28 20z" fill="#f6f7f3"/>'
    for dx in [20, w - 20] if double else [w / 2]:
        for y in [92, 274]:
            s += f'<rect x="{x + dx - 12}" y="{y - 9}" width="24" height="19" rx="3" fill="#b6bdba"/><circle cx="{x + dx}" cy="{y}" r="7" fill="#535f62"/><path d="M{x + dx - 4} {y}h8" stroke="#adb5b2" stroke-width="2"/>'
    s += f'<rect x="{x + 8}" y="118" width="{w - 16}" height="56" rx="3" fill="#c4cac7"/><rect x="{x + 15}" y="127" width="{w - 30}" height="33" rx="3" fill="{switch}"/><path d="M{x + 18} 129h{w - 36}" stroke="white" opacity=".4"/><text x="{x + 10}" y="196" font-size="11" fill="{switch}" font-family="Arial" font-weight="bold">{brand}</text><text x="{x + 10}" y="217" font-size="14" fill="#334149" font-family="Arial">C16</text><text x="{x + 10}" y="234" font-size="9" fill="#697477" font-family="Arial">230 V ~ 6000</text><path d="M{x + 12} 249h18v-8m-9 8v10" stroke="#667477" fill="none"/></g>'
    return s


save("breaker", breaker())
save("rcd", breaker(140, "ABB", "#b53535", True))
save("contactor", breaker(118, "IEK", "#343d42", True))
save(
    "cable",
    """<g transform="rotate(-18 220 180)"><ellipse cx="215" cy="187" rx="119" ry="86" fill="none" stroke="#20292e" stroke-width="62"/><ellipse cx="215" cy="187" rx="119" ry="86" fill="none" stroke="#485156" stroke-width="2"/><ellipse cx="215" cy="187" rx="110" ry="79" fill="none" stroke="#5b6467" stroke-width="2"/><ellipse cx="215" cy="187" rx="127" ry="93" fill="none" stroke="#596165" stroke-width="2"/><ellipse cx="215" cy="187" rx="102" ry="72" fill="none" stroke="#111a1e" stroke-width="2"/><path d="M305 237Q377 251 354 145" stroke="#252f34" stroke-width="24" fill="none"/><path d="M353 150l-7-46" stroke="#4982ad" stroke-width="8"/><path d="M357 151l14-45" stroke="#bb8f3b" stroke-width="8"/><path d="M349 153l-25-40" stroke="#9a5c42" stroke-width="8"/><path d="M346 104l-2-13m27 15 4-13m-51 20-7-10" stroke="#d7aa70" stroke-width="5"/><path d="M109 168l32-14m150 79 31-15" stroke="#bc9f5b" stroke-width="26"/><text x="154" y="290" fill="#778083" font-family="Arial" font-size="10">ВВГнг-LS 3 × 2,5</text></g>""",
)
save(
    "panel",
    """<g transform="rotate(-8 220 180)"><path d="M111 87l26-17h210v213l-26 21H111z" fill="#b4bebf"/><rect x="111" y="87" width="210" height="217" rx="8" fill="url(#body)" stroke="#b7bfc0"/><rect x="127" y="106" width="178" height="157" rx="7" fill="#2e424a"/><rect x="135" y="113" width="162" height="145" rx="4" fill="#53646a"/><path d="M140 122h148v39H140z" fill="#819094"/><path d="M141 167h147v77H141z" fill="#667a81"/><path d="M150 171v69m13-69v69m13-69v69m13-69v69m13-69v69m13-69v69m13-69v69m13-69v69m13-69v69m13-69v69" stroke="#a8b0ad" stroke-width="7"/><path d="M127 106h178v157H127z" fill="#69878f" opacity=".35"/><path d="M136 113h110l-110 97z" fill="white" opacity=".1"/><rect x="280" y="180" width="15" height="30" rx="4" fill="#aab4b3"/><text x="192" y="286" font-family="Arial" font-size="15" fill="#68787a" font-weight="bold">IEK</text></g>""",
)
save(
    "light",
    """<g transform="rotate(-12 220 180)"><path d="M129 239v45h180v-45" fill="none" stroke="#323d42" stroke-width="14"/><rect x="105" y="85" width="224" height="169" rx="14" fill="url(#black)"/><rect x="120" y="100" width="194" height="139" rx="7" fill="#cad2cf"/><path d="M128 108l30 28v70l-30 25m178-123-30 28v70l30 25" fill="#edf1e9"/><rect x="156" y="133" width="120" height="75" rx="5" fill="#f2e5ab"/><path d="M167 142h100m-100 12h100m-100 12h100m-100 12h100m-100 12h100m-100 12h100" stroke="#e0ca7a" stroke-width="5"/><circle cx="116" cy="95" r="3" fill="#a3b0b2"/><circle cx="317" cy="244" r="3" fill="#a3b0b2"/></g>""",
)
save(
    "terminal",
    """<g transform="rotate(-13 220 180)"><path d="M115 130l42-30h168v126l-42 37H115z" fill="#9caeae"/><rect x="115" y="130" width="168" height="133" rx="7" fill="url(#body)"/><path d="M115 130l42-30h168l-42 30z" fill="#dde1d9"/><g fill="#f17c36" stroke="#d86a25" stroke-width="2"><path d="M128 133l28-25h29l-28 25v67h-29z"/><path d="M181 133l28-25h29l-28 25v67h-29z"/><path d="M234 133l28-25h29l-28 25v67h-29z"/></g><g fill="#657779"><ellipse cx="142" cy="235" rx="14" ry="12"/><ellipse cx="195" cy="235" rx="14" ry="12"/><ellipse cx="248" cy="235" rx="14" ry="12"/></g></g>""",
)
save(
    "relay",
    """<g transform="rotate(-8 220 180)"><path d="M155 67l25-16h116v230l-25 20H155z" fill="#abb6b8"/><rect x="155" y="67" width="116" height="234" rx="6" fill="url(#body)" stroke="#b4bdbb"/><rect x="169" y="103" width="88" height="89" rx="6" fill="#35474b"/><text x="180" y="148" font-family="monospace" font-size="31" fill="#f27356">230</text><text x="187" y="177" font-family="Arial" font-size="12" fill="#d6e2dd">ZUBR</text><circle cx="185" cy="218" r="9" fill="#a9b9b9"/><circle cx="241" cy="218" r="9" fill="#a9b9b9"/><text x="196" y="257" font-family="Arial" font-size="12" fill="#637579">63 A</text><path d="M174 80h78m-78 201h78" stroke="#7c898d" stroke-width="10"/></g>""",
)

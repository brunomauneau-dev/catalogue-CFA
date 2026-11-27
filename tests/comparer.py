# Comparaison visuelle : captures de tests/sortie/captures/ contre tests/references/ (données fictives).
# Une capture qui diffère de plus de SEUIL % de pixels est signalée ; l'image des différences va dans tests/sortie/diff/.
# « --maj » remplace les références par les captures actuelles (après un changement d'affichage voulu).
import sys, os, shutil
from PIL import Image, ImageChops
ICI = os.path.dirname(os.path.abspath(__file__))
CAP, REF, DIFF = (os.path.join(ICI, d) for d in ("sortie/captures", "references", "sortie/diff"))
SEUIL = 0.5  # % de pixels différents tolérés (anticrénelage, heure affichée…)
os.makedirs(REF, exist_ok=True); os.makedirs(DIFF, exist_ok=True)
noms = sorted(f for f in os.listdir(CAP) if f.endswith(".png"))
if "--maj" in sys.argv:
    for f in noms: shutil.copy(os.path.join(CAP, f), os.path.join(REF, f))
    print(f"  références mises à jour : {len(noms)} captures"); sys.exit(0)
ecarts = []
for f in noms:
    r = os.path.join(REF, f)
    if not os.path.exists(r): print(f"  ? {f} : pas de référence (lancer avec --maj-references)"); continue
    a, b = Image.open(os.path.join(CAP, f)).convert("RGB"), Image.open(r).convert("RGB")
    if a.size != b.size: ecarts.append((f, f"taille {b.size} → {a.size}")); continue
    d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 24 else 0)
    pct = 100 * sum(d.histogram()[255:]) / (a.size[0] * a.size[1])
    if pct > SEUIL:
        ecarts.append((f, f"{pct:.2f} % de pixels différents"))
        Image.composite(Image.new("RGB", a.size, (255, 0, 0)), a, d).save(os.path.join(DIFF, f))
print(f"  comparaison visuelle : {len(noms) - len(ecarts)}/{len(noms)} captures identiques aux références")
for f, m in ecarts: print(f"  ≠ {f} : {m}")
sys.exit(1 if ecarts else 0)

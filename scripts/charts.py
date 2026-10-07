"""
Evaluation charts for the Phase 2 report (static PNG for the PDF).
Left: structural As Is versus To Be comparison (counts from Figure A1 and the simulation).
Right: cycle time of won clients in the simulation (dot strip with median).
Palette: categorical slots 1 (blue) and 2 (orange) of the reference palette.
"""
import json
import statistics
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

BLUE, ORANGE, INK, MUTED, GRID = "#2a78d6", "#eb6834", "#0b0b0b", "#52514e", "#e6e5e1"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": GRID,
                     "axes.labelcolor": MUTED, "xtick.color": MUTED, "ytick.color": MUTED})

sim = json.load(open("results/simulation.json"))
manual_tobe = sim["kpis"]["manualTouchesPerInquiry"]

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 3.6), gridspec_kw={"width_ratios": [1.25, 1]})

# ---- panel 1: grouped horizontal bars, same unit (count per won client)
metrics = ["Manual developer tasks\nper won client", "Times client data is\ntyped by the developer"]
as_is = [11, 3]
to_be = [2, 0]
y = range(len(metrics))
h = 0.3
ax1.barh([i - h / 2 - 0.02 for i in y], as_is, height=h, color=ORANGE, label="As Is (Phase 1 model)")
ax1.barh([i + h / 2 + 0.02 for i in y], to_be, height=h, color=BLUE, label="To Be (prototype)")
for i in y:
    ax1.text(as_is[i] + 0.2, i - h / 2 - 0.02, str(as_is[i]), va="center", color=INK, fontsize=9)
    ax1.text(to_be[i] + 0.2, i + h / 2 + 0.02, str(to_be[i]), va="center", color=INK, fontsize=9)
ax1.set_yticks(list(y), metrics); ax1.tick_params(axis="y", length=0)
ax1.invert_yaxis()
ax1.set_xlim(0, 14)
ax1.xaxis.grid(True, color=GRID, lw=0.8); ax1.set_axisbelow(True)
for s in ["top", "right", "left"]: ax1.spines[s].set_visible(False)
ax1.legend(frameon=False, loc="lower right", fontsize=9)
ax1.set_title("Manual effort per won client", loc="left", color=INK, fontsize=11, fontweight="bold")

# ---- panel 2: dot strip of cycle times with median line
days = sorted(sim["cycleDays"])
med = statistics.median(days)
jitter = [((i * 37) % 11 - 5) / 40 for i in range(len(days))]
ax2.scatter(days, jitter, s=46, color=BLUE, edgecolor="white", linewidth=1.2, zorder=3)
ax2.axvline(med, color=INK, lw=1.2, ls="--")
ax2.text(med + 0.3, 0.2, f"median {med:.1f} days", color=INK, fontsize=9)
ax2.set_ylim(-0.3, 0.3); ax2.set_yticks([])
ax2.set_xlim(0, max(days) + 2)
ax2.set_xlabel("Days from inquiry to signed contract")
ax2.xaxis.grid(True, color=GRID, lw=0.8); ax2.set_axisbelow(True)
for s in ["top", "right", "left"]: ax2.spines[s].set_visible(False)
ax2.set_title(f"Cycle time of {len(days)} won clients (simulation)", loc="left", color=INK, fontsize=11, fontweight="bold")

fig.tight_layout()
fig.savefig("../evidence/14_evaluation_chart.png", dpi=220, facecolor="white")
print("median", med, "n", len(days))

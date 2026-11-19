"""Validate exported meshes with trimesh (https://trimesh.org, MIT).

For every case in manifest.json and every format (STL, 3MF, GLB, OBJ):
  * the file loads,
  * the mesh is watertight, winding-consistent and a valid volume (manifold),
  * the volume matches the expected volume (analytic or Monte Carlo) within tolerance,
  * the bounding-box size matches the expected size within the meshing resolution,
  * 3MF files also load without errors or warnings in lib3mf, the 3MF Consortium's
    reference implementation (BSD-2-Clause), and declare millimetres.

Usage: python scripts/validate_meshes.py artifacts/meshes
Exit code is non-zero if anything fails.
"""

import json
import sys
from pathlib import Path

import lib3mf
import numpy as np
import trimesh

_LIB3MF = lib3mf.get_wrapper()


def check_3mf(path: Path) -> list[str]:
    """Read with the reference implementation; return a list of problems."""
    problems = []
    model = _LIB3MF.CreateModel()
    reader = model.QueryReader("3mf")
    reader.SetStrictModeActive(True)
    try:
        reader.ReadFromFile(str(path))
    except Exception as exc:  # noqa: BLE001
        return [f"lib3mf could not read it ({exc})"]
    for i in range(reader.GetWarningCount()):
        code, msg = reader.GetWarning(i)
        problems.append(f"lib3mf warning {code}: {msg}")
    if model.GetUnit() != lib3mf.ModelUnit.MilliMeter:
        problems.append("unit is not millimetre")
    objs = model.GetMeshObjects()
    count = 0
    while objs.MoveNext():
        mesh = objs.GetCurrentMeshObject()
        count += 1
        if mesh.GetTriangleCount() == 0:
            problems.append("empty mesh object")
        if not mesh.IsManifoldAndOriented():
            problems.append("lib3mf: mesh is not manifold and oriented")
    if count != 1:
        problems.append(f"expected 1 mesh object, found {count}")
    return problems


def load(path: Path) -> trimesh.Trimesh:
    m = trimesh.load(path, force="mesh", process=True)
    if not isinstance(m, trimesh.Trimesh):
        raise ValueError(f"{path.name}: did not load as a single mesh")
    return m


def scene_axes_size(mesh: trimesh.Trimesh, fmt: str, mm_per_unit: float) -> np.ndarray:
    """Return the bounding box size in millimetres along the scene's x, y, z axes."""
    ext = mesh.bounding_box.extents
    if fmt in ("stl", "3mf"):  # Z-up millimetres: scene (x, y, z) -> file (x, -z, y)
        return np.array([ext[0], ext[2], ext[1]])
    if fmt == "glb":  # Y-up metres
        return ext * 1000.0
    return ext  # OBJ: Y-up millimetres


def volume_mm3(mesh: trimesh.Trimesh, fmt: str) -> float:
    v = float(mesh.volume)
    return v * 1e9 if fmt == "glb" else v


def main(root: str) -> int:
    base = Path(root)
    manifest = json.loads((base / "manifest.json").read_text())
    failures = []
    rows = []
    for case in manifest:
        for fmt, info in case["files"].items():
            if fmt == "usdz":  # checked by validate_usdz.py with the USD library
                continue
            path = base / info["file"]
            name = f"{case['id']}.{fmt}"
            try:
                mesh = load(path)
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{name}: failed to load ({exc})")
                continue
            problems = check_3mf(path) if fmt == "3mf" else []
            if not mesh.is_watertight:
                problems.append("not watertight")
            if not mesh.is_winding_consistent:
                problems.append("inconsistent winding")
            if not mesh.is_volume:
                problems.append("not a valid volume")
            # every edge shared by exactly two faces
            edges = mesh.edges_sorted
            _, counts = np.unique(edges, axis=0, return_counts=True)
            if counts.max(initial=2) != 2 or counts.min(initial=2) != 2:
                problems.append("non-manifold edges")
            vol = volume_mm3(mesh, fmt)
            expected = case["expectedVolume"]
            tol = case["volumeTolerance"]
            rel = abs(vol - expected) / expected
            if rel > tol:
                problems.append(f"volume {vol:.1f} mm3 vs expected {expected:.1f} ({rel:.1%} > {tol:.1%})")
            size = scene_axes_size(mesh, fmt, case["mmPerUnit"])
            exp_size = np.array(case["expectedSize"])
            # allowed: two mesh cells, plus sampling slack for Monte Carlo extents
            slack = 2.5 * case["edgeMm"] + (0.0 if case["sizeSource"] == "analytic" else 0.03 * exp_size.max())
            if np.any(np.abs(size - exp_size) > slack):
                problems.append(f"size {np.round(size, 2)} vs expected {np.round(exp_size, 2)} (slack {slack:.2f})")
            # scale-invariant: a face is degenerate if its area is negligible relative to the model size
            diag2 = float(np.sum(mesh.bounding_box.extents ** 2))
            degenerate = int((mesh.area_faces <= 1e-12 * diag2).sum())
            if degenerate:
                problems.append(f"{degenerate} zero-area faces")
            if vol <= 0:
                problems.append("inside-out (negative volume)")
            rows.append((name, len(mesh.faces), vol, rel, "ok" if not problems else "; ".join(problems)))
            if problems:
                failures.append(f"{name}: {'; '.join(problems)}")
    width = max(len(r[0]) for r in rows) if rows else 10
    for name, faces, vol, rel, status in rows:
        print(f"{name:<{width}}  {faces:>8} faces  {vol:>12.1f} mm3  dV {rel:6.2%}  {status}")
    print()
    if failures:
        print(f"FAILED: {len(failures)} problem(s)")
        for f in failures:
            print("  -", f)
        return 1
    print(f"All {len(rows)} meshes are watertight, manifold and match their expected size and volume.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "artifacts/meshes"))

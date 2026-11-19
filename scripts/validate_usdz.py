"""Validate exported USDZ files with Pixar's USD library (usd-core, Apache-2.0).

For every case in manifest.json with a USDZ file:
  * the package opens as a USD stage,
  * Apple's ARKit / AR Quick Look compliance rules pass (UsdUtils.ComplianceChecker(arkit=True)),
  * the mesh has the same triangle count as the export reported,
  * its extent matches the expected size in millimetres (metersPerUnit = 0.001),
  * every face is bound to a material through exactly one GeomSubset.

The usd-core wheel ships the shader discovery plugin without its definitions
(shaderDefs.usda), so the ARKit rule 'ShaderPropertyTypeConformanceChecker'
cannot look up UsdPreviewSurface. When that definition is missing, that one
rule is skipped and each shader is instead checked here against the published
UsdPreviewSurface spec (input names and types, surface output).

Usage: python scripts/validate_usdz.py artifacts/meshes
"""

import json
import sys
from pathlib import Path

from pxr import Sdf, Sdr, Usd, UsdGeom, UsdShade, UsdUtils

# UsdPreviewSurface inputs we write, with their types (https://openusd.org/release/spec_usdpreviewsurface.html)
PREVIEW_SURFACE_INPUTS = {
    "diffuseColor": Sdf.ValueTypeNames.Color3f,
    "roughness": Sdf.ValueTypeNames.Float,
    "metallic": Sdf.ValueTypeNames.Float,
}
HAVE_SHADER_DEFS = Sdr.Registry().GetShaderNodeByIdentifier("UsdPreviewSurface") is not None


def check(path: Path, case: dict, info: dict) -> list[str]:
    problems = []
    checker = UsdUtils.ComplianceChecker(arkit=True, skipARKitRootLayerCheck=False, rootPackageOnly=False)
    checker.CheckCompliance(str(path))
    problems += [f"compliance: {e}" for e in checker.GetErrors() if HAVE_SHADER_DEFS or "shaderDefs" not in e]
    problems += [
        f"compliance: {e}"
        for e in checker.GetFailedChecks()
        if HAVE_SHADER_DEFS or "ShaderPropertyTypeConformanceChecker" not in e
    ]
    stage = Usd.Stage.Open(str(path))
    if stage is None:
        return problems + ["could not open the stage"]
    for prim in stage.Traverse():
        if not prim.IsA(UsdShade.Shader):
            continue
        sh = UsdShade.Shader(prim)
        if sh.GetIdAttr().Get() != "UsdPreviewSurface":
            problems.append(f"{prim.GetPath()}: not a UsdPreviewSurface")
            continue
        for inp in sh.GetInputs():
            want = PREVIEW_SURFACE_INPUTS.get(inp.GetBaseName())
            if want is None or inp.GetTypeName() != want:
                problems.append(f"{prim.GetPath()}: unexpected input {inp.GetBaseName()} ({inp.GetTypeName()})")
        if not sh.GetOutput("surface"):
            problems.append(f"{prim.GetPath()}: no surface output")
    if abs(UsdGeom.GetStageMetersPerUnit(stage) - 0.001) > 1e-12:
        problems.append("metersPerUnit is not 0.001 (millimetres)")
    if UsdGeom.GetStageUpAxis(stage) != UsdGeom.Tokens.y:
        problems.append("up axis is not Y")
    meshes = [UsdGeom.Mesh(p) for p in stage.Traverse() if p.IsA(UsdGeom.Mesh)]
    if len(meshes) != 1:
        return problems + [f"expected 1 mesh, found {len(meshes)}"]
    mesh = meshes[0]
    counts = mesh.GetFaceVertexCountsAttr().Get()
    if len(counts) != info["triangles"] or any(c != 3 for c in counts):
        problems.append(f"{len(counts)} faces vs {info['triangles']} exported triangles")
    lo, hi = mesh.GetExtentAttr().Get()
    size = [hi[i] - lo[i] for i in range(3)]
    exp = case["expectedSize"]
    slack = 2.5 * case["edgeMm"] + (0.0 if case["sizeSource"] == "analytic" else 0.03 * max(exp))
    if any(abs(size[i] - exp[i]) > slack for i in range(3)):
        problems.append(f"size {[round(v, 2) for v in size]} vs expected {[round(v, 2) for v in exp]}")
    covered = [0] * len(counts)
    for subset in UsdGeom.Subset.GetAllGeomSubsets(mesh):
        mat, _ = UsdShade.MaterialBindingAPI(subset.GetPrim()).ComputeBoundMaterial()
        if not mat:
            problems.append(f"subset {subset.GetPrim().GetName()} has no material")
        for i in subset.GetIndicesAttr().Get():
            covered[i] += 1
    if any(c != 1 for c in covered):
        problems.append("faces are not bound to exactly one material")
    return problems


def main(root: str) -> int:
    base = Path(root)
    manifest = json.loads((base / "manifest.json").read_text())
    failures, n = [], 0
    for case in manifest:
        info = case["files"].get("usdz")
        if not info:
            continue
        n += 1
        problems = check(base / info["file"], case, info)
        print(f"{info['file']:<24} {'ok' if not problems else '; '.join(problems)}")
        if problems:
            failures.append(info["file"])
    print()
    if failures:
        print(f"FAILED: {len(failures)} USDZ file(s)")
        return 1
    note = "" if HAVE_SHADER_DEFS else " (shader types checked against the UsdPreviewSurface spec)"
    print(f"All {n} USDZ files open in USD, pass the ARKit compliance checks{note} and match their size.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "artifacts/meshes"))
